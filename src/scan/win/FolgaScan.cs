// Leitor rápido de pastas do folga (Windows). Compilado na hora pelo Add-Type do PowerShell 5.1 (C# 5).
// Lista cada pasta com GetFileInformationByHandleEx(FileIdBothDirectoryInfo): a listagem já traz tamanho,
// tamanho alocado, data, atributos e FileId, sem abrir cada arquivo. Só lê; nunca grava fora do arquivo de saída.
//
// Saída (UTF-8, uma linha por registro, campos separados por TAB):
//   D id pai mtimeMs semAcesso nArquivos tamanho alocado nome   (pasta; o pai sempre sai antes dos filhos)
//   F idPasta tamanho alocado mtimeMs flags nome                 (flags: 1 = entre os maiores da pasta, 2 = arquivo grande)
//   P arquivos pastas bytes semAcesso caminhoAtual              (progresso, a cada 250 ms)
//   E ok|cancel|error [mensagem]                                 (fim)
// Nome com caractere de controle ou começando com '=' sai como '=' + base64(UTF-8).
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using Microsoft.Win32.SafeHandles;

public static class FolgaScan
{
    const uint FILE_LIST_DIRECTORY = 0x1;
    const uint SYNCHRONIZE = 0x100000;
    const uint SHARE_ALL = 0x7;
    const uint OPEN_EXISTING = 3;
    const uint FLAG_BACKUP_SEMANTICS = 0x02000000;
    const uint FLAG_OPEN_REPARSE_POINT = 0x00200000;
    const int FileIdBothDirectoryInfo = 10;
    const int FileIdBothDirectoryRestartInfo = 11;
    const uint ATTR_DIRECTORY = 0x10;
    const uint ATTR_REPARSE = 0x400;
    const int ERROR_NO_MORE_FILES = 18;
    const int TOP = 50;
    const int BUF = 256 * 1024;

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern SafeFileHandle CreateFileW(string name, uint access, uint share, IntPtr sec, uint disp, uint flags, IntPtr tmpl);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool GetFileInformationByHandleEx(SafeFileHandle h, int cls, IntPtr buf, uint size);

    [DllImport("advapi32.dll", SetLastError = true)]
    static extern bool OpenProcessToken(IntPtr proc, uint access, out IntPtr token);

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool LookupPrivilegeValueW(string sys, string name, out long luid);

    [StructLayout(LayoutKind.Sequential, Pack = 4)]
    struct TokPriv { public int Count; public long Luid; public int Attr; }

    [DllImport("advapi32.dll", SetLastError = true)]
    static extern bool AdjustTokenPrivileges(IntPtr token, bool disableAll, ref TokPriv state, int len, IntPtr prev, IntPtr retLen);

    [DllImport("kernel32.dll")]
    static extern IntPtr GetCurrentProcess();

    class Item { public long Id; public long Parent; public string Path; public string Name; public long Mtime; public bool IsRoot; }
    class FileRec { public string Name; public long Size; public long Alloc; public long Mtime; }

    static readonly object qLock = new object();
    static readonly Stack<Item> queue = new Stack<Item>();
    static int busy;
    static bool stop;
    static long nextId;
    static readonly object outLock = new object();
    static StreamWriter output;
    static readonly HashSet<long>[] seen = new HashSet<long>[64];
    static long files, dirs, bytes, unreadable;
    static volatile string current = "";
    static long largeMin;

    /// args: raizBase64 saida(- = stdout) arquivoCancelar pidPai largeMin threads admin(0|1)
    public static int Run(string[] args)
    {
        string root = Encoding.UTF8.GetString(Convert.FromBase64String(args[0]));
        string outPath = args[1];
        string cancelPath = args[2];
        int parentPid = int.Parse(args[3]);
        largeMin = long.Parse(args[4]);
        int threads = Math.Max(1, Math.Min(64, int.Parse(args[5])));
        bool admin = args[6] == "1";
        for (int i = 0; i < seen.Length; i++) seen[i] = new HashSet<long>();

        Stream s = outPath == "-" ? Console.OpenStandardOutput() : OpenOut(outPath);
        output = new StreamWriter(s, new UTF8Encoding(false), 1 << 16);
        output.NewLine = "\n";
        if (admin) EnableBackupPrivilege();

        string status = "ok";
        try
        {
            if (ShouldCancel(cancelPath, parentPid)) { Line("E	cancel", true); output.Dispose(); return 0; }
            long rootMtime = 0;
            try { rootMtime = ToMs(Directory.GetLastWriteTimeUtc(root).ToFileTimeUtc()); } catch { }
            queue.Push(new Item { Id = 0, Parent = -1, Path = root, Name = root, Mtime = rootMtime, IsRoot = true });
            nextId = 1;
            var workers = new Thread[threads];
            for (int i = 0; i < threads; i++) { workers[i] = new Thread(Worker); workers[i].IsBackground = true; workers[i].Start(); }
            var watch = Stopwatch.StartNew();
            while (true)
            {
                bool done = true;
                foreach (var w in workers) if (!w.Join(0)) { done = false; break; }
                if (done) break;
                Thread.Sleep(250);
                if (ShouldCancel(cancelPath, parentPid)) { stop = true; status = "cancel"; lock (qLock) Monitor.PulseAll(qLock); }
                Line("P\t" + Interlocked.Read(ref files) + "\t" + Interlocked.Read(ref dirs) + "\t" + Interlocked.Read(ref bytes) + "\t" + Interlocked.Read(ref unreadable) + "\t" + Enc(current), true);
            }
        }
        catch (Exception e)
        {
            status = "error\t" + Enc(e.Message);
        }
        Line("E\t" + status, true);
        output.Dispose();
        return 0;
    }

    // O arquivo de saída já foi criado pelo servidor. Como o leitor pode rodar elevado numa pasta
    // gravável pelo usuário, só abre um arquivo comum que já existe: nunca segue reparse point,
    // nunca escreve num hardlink (que poderia apontar para um arquivo do sistema).
    static Stream OpenOut(string path)
    {
        var h = CreateFileW(path, 0x40000000 /* GENERIC_WRITE */, SHARE_ALL, IntPtr.Zero, OPEN_EXISTING, FLAG_OPEN_REPARSE_POINT, IntPtr.Zero);
        if (h.IsInvalid) throw new IOException("saída inacessível: " + Marshal.GetLastWin32Error());
        IntPtr info = Marshal.AllocHGlobal(64);
        try
        {
            if (!GetFileInformationByHandleEx(h, 0 /* FileBasicInfo */, info, 40)) throw new IOException("saída: sem atributos");
            uint attrs = (uint)Marshal.ReadInt32(info, 32);
            if ((attrs & (ATTR_REPARSE | ATTR_DIRECTORY)) != 0) throw new IOException("saída não é um arquivo comum");
            if (!GetFileInformationByHandleEx(h, 1 /* FileStandardInfo */, info, 24)) throw new IOException("saída: sem informações");
            if (Marshal.ReadInt32(info, 16) != 1) throw new IOException("saída com mais de um nome (hardlink)");
        }
        catch { h.Dispose(); throw; }
        finally { Marshal.FreeHGlobal(info); }
        var fsOut = new FileStream(h, FileAccess.Write);
        fsOut.SetLength(0);
        return fsOut;
    }

    static bool ShouldCancel(string cancelPath, int pid)
    {
        if (cancelPath != "-" && File.Exists(cancelPath)) return true;
        try { var p = Process.GetProcessById(pid); return p.HasExited; } catch { return true; }
    }

    static void Worker()
    {
        IntPtr buf = Marshal.AllocHGlobal(BUF);
        try
        {
            while (true)
            {
                Item it;
                lock (qLock)
                {
                    while (queue.Count == 0 && busy > 0 && !stop) Monitor.Wait(qLock);
                    if (stop || queue.Count == 0) { Monitor.PulseAll(qLock); return; }
                    it = queue.Pop();
                    busy++;
                }
                var kids = new List<Item>();
                try { ProcessDir(it, buf, kids); }
                catch { }
                lock (qLock)
                {
                    foreach (var k in kids) queue.Push(k);
                    busy--;
                    Monitor.PulseAll(qLock);
                }
            }
        }
        finally { Marshal.FreeHGlobal(buf); }
    }

    static string Long(string p)
    {
        if (p.StartsWith(@"\\?\")) return p;
        if (p.StartsWith(@"\\")) return @"\\?\UNC\" + p.Substring(2);
        return @"\\?\" + p;
    }

    static long ToMs(long fileTime) { return fileTime <= 0 ? 0 : (fileTime - 116444736000000000L) / 10000; }

    static bool Surrogate(uint tag) { return (tag & 0x20000000) != 0; }

    static void ProcessDir(Item it, IntPtr buf, List<Item> kids)
    {
        current = it.Path;
        bool noAccess = false;
        long nFiles = 0, size = 0, alloc = 0;
        var top = new List<FileRec>();
        var large = new List<FileRec>();
        var childDirs = new List<Item>();
        uint flags = FLAG_BACKUP_SEMANTICS | (it.IsRoot ? 0 : FLAG_OPEN_REPARSE_POINT);
        using (var h = CreateFileW(Long(it.Path), FILE_LIST_DIRECTORY | SYNCHRONIZE, SHARE_ALL, IntPtr.Zero, OPEN_EXISTING, flags, IntPtr.Zero))
        {
            if (h.IsInvalid) noAccess = true;
            else
            {
                int cls = FileIdBothDirectoryRestartInfo;
                while (!stop)
                {
                    if (!GetFileInformationByHandleEx(h, cls, buf, BUF))
                    {
                        if (Marshal.GetLastWin32Error() != ERROR_NO_MORE_FILES) noAccess = true;
                        break;
                    }
                    cls = FileIdBothDirectoryInfo;
                    int off = 0;
                    while (true)
                    {
                        IntPtr e = IntPtr.Add(buf, off);
                        int next = Marshal.ReadInt32(e, 0);
                        long mtime = ToMs(Marshal.ReadInt64(e, 24));
                        long eof = Marshal.ReadInt64(e, 40);
                        long al = Marshal.ReadInt64(e, 48);
                        uint attr = (uint)Marshal.ReadInt32(e, 56);
                        int nameLen = Marshal.ReadInt32(e, 60);
                        uint ea = (uint)Marshal.ReadInt32(e, 64);
                        long fid = Marshal.ReadInt64(e, 96);
                        string name = Marshal.PtrToStringUni(IntPtr.Add(e, 104), nameLen / 2);
                        bool skip = name == "." || name == ".." || ((attr & ATTR_REPARSE) != 0 && Surrogate(ea));
                        if (!skip)
                        {
                            if ((attr & ATTR_DIRECTORY) != 0)
                            {
                                childDirs.Add(new Item { Parent = it.Id, Path = Path.Combine(it.Path, name), Name = name, Mtime = mtime });
                            }
                            else if (FirstSeen(fid))
                            {
                                nFiles++; size += eof; alloc += al;
                                var f = new FileRec { Name = name, Size = eof, Alloc = al, Mtime = mtime };
                                top.Add(f);
                                if (top.Count > TOP * 4) { top.Sort(BySizeDesc); top.RemoveRange(TOP, top.Count - TOP); }
                                if (eof >= largeMin) large.Add(f);
                            }
                        }
                        if (next == 0) break;
                        off += next;
                    }
                }
            }
        }
        if (noAccess) Interlocked.Increment(ref unreadable);
        Interlocked.Add(ref files, nFiles);
        Interlocked.Add(ref bytes, size);
        Interlocked.Add(ref dirs, childDirs.Count);
        top.Sort(BySizeDesc);
        if (top.Count > TOP) top.RemoveRange(TOP, top.Count - TOP);
        var sb = new StringBuilder();
        foreach (var c in childDirs) c.Id = Interlocked.Increment(ref nextId);
        sb.Append("D\t").Append(it.Id).Append('\t').Append(it.Parent).Append('\t').Append(it.Mtime).Append('\t').Append(noAccess ? 1 : 0)
          .Append('\t').Append(nFiles).Append('\t').Append(size).Append('\t').Append(alloc).Append('\t').Append(it.IsRoot ? "" : Enc(it.Name)).Append('\n');
        var topSet = new HashSet<FileRec>(top);
        foreach (var f in top) FileLine(sb, it.Id, f, 1 | (f.Size >= largeMin ? 2 : 0));
        foreach (var f in large) if (!topSet.Contains(f)) FileLine(sb, it.Id, f, 2);
        Line(sb.ToString(), false);
        kids.AddRange(childDirs);
    }

    static int BySizeDesc(FileRec a, FileRec b) { return b.Size.CompareTo(a.Size); }

    static void FileLine(StringBuilder sb, long dir, FileRec f, int flags)
    {
        sb.Append("F\t").Append(dir).Append('\t').Append(f.Size).Append('\t').Append(f.Alloc).Append('\t').Append(f.Mtime)
          .Append('\t').Append(flags).Append('\t').Append(Enc(f.Name)).Append('\n');
    }

    static bool FirstSeen(long fid)
    {
        if (fid == 0) return true;
        var set = seen[(int)((ulong)fid % (ulong)seen.Length)];
        lock (set) return set.Add(fid);
    }

    static string Enc(string s)
    {
        bool bad = s.Length > 0 && s[0] == '=';
        if (!bad) foreach (char c in s) if (c < 0x20) { bad = true; break; }
        return bad ? "=" + Convert.ToBase64String(Encoding.UTF8.GetBytes(s)) : s;
    }

    static void Line(string text, bool newline)
    {
        lock (outLock)
        {
            if (newline) { output.Write(text); output.Write('\n'); output.Flush(); }
            else output.Write(text);
        }
    }

    static void EnableBackupPrivilege()
    {
        IntPtr tok;
        if (!OpenProcessToken(GetCurrentProcess(), 0x20 | 0x8, out tok)) return;
        var tp = new TokPriv { Count = 1, Attr = 2 };
        if (LookupPrivilegeValueW(null, "SeBackupPrivilege", out tp.Luid)) AdjustTokenPrivileges(tok, false, ref tp, 0, IntPtr.Zero, IntPtr.Zero);
    }
}
