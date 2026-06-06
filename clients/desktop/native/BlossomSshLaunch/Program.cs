using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;

internal static class Program
{
	private static string NormalizeUser(string raw)
	{
		if (string.IsNullOrEmpty(raw)) return null;
		string s = raw.Trim();
		string prev;
		do
		{
			prev = s;
			if (s.Length >= 2 && s[0] == '"' && s[s.Length - 1] == '"')
				s = s.Substring(1, s.Length - 2).Trim();
			else if (s.Length >= 2 && s[0] == '\'' && s[s.Length - 1] == '\'')
				s = s.Substring(1, s.Length - 2).Trim();
			else if (s.Length >= 2 && s[0] == '\u201C' && s[s.Length - 1] == '\u201D')
				s = s.Substring(1, s.Length - 2).Trim();
			else if (s.Length >= 2 && s[0] == '\u2018' && s[s.Length - 1] == '\u2019')
				s = s.Substring(1, s.Length - 2).Trim();
			else break;
		} while (s != prev);
		if (string.IsNullOrEmpty(s)) return null;
		return s;
	}

	private static string DecodePwFromQuery(string encoded)
	{
		if (string.IsNullOrEmpty(encoded)) return null;
		try
		{
			string s = Uri.UnescapeDataString(encoded).Trim();
			s = s.Replace('-', '+').Replace('_', '/');
			switch (s.Length % 4)
			{
				case 2: s += "=="; break;
				case 3: s += "="; break;
			}
			byte[] bytes = Convert.FromBase64String(s);
			string pw = Encoding.UTF8.GetString(bytes);
			if (pw.IndexOf('\0') >= 0 || pw.Length > 512) return null;
			if (pw.IndexOf('\r') >= 0 || pw.IndexOf('\n') >= 0) return null;
			return pw;
		}
		catch
		{
			return null;
		}
	}

	[STAThread]
	private static int Main(string[] args)
	{
		if (args.Length < 1) return 1;
		string raw = args[0].Trim().Trim('"');
		Uri uri;
		try
		{
			uri = new Uri(raw);
		}
		catch (UriFormatException)
		{
			return 1;
		}
		bool isSftp = string.Equals(uri.Scheme, "blossom-sftp", StringComparison.OrdinalIgnoreCase);
		if (!isSftp && !string.Equals(uri.Scheme, "blossom-ssh", StringComparison.OrdinalIgnoreCase)) return 1;
		if (!string.Equals(uri.Host, "open", StringComparison.OrdinalIgnoreCase)) return 1;

		string query = (uri.Query ?? "").TrimStart('?');
		Dictionary<string, string> pairs = ParseQuery(query);
		string targetHost;
		if (!pairs.TryGetValue("host", out targetHost) || string.IsNullOrEmpty(targetHost)) return 1;
		if (targetHost.Length > 253) return 1;
		if (Regex.IsMatch(targetHost, @"[^\w.\[\]:+%-]")) return 1;

		int port = isSftp ? 22 : 22;
		string portStr;
		if (pairs.TryGetValue("port", out portStr) && !string.IsNullOrEmpty(portStr))
		{
			int pn;
			if (int.TryParse(portStr, out pn) && pn >= 1 && pn <= 65535) port = pn;
		}

		string user = null;
		string userRaw;
		if (pairs.TryGetValue("user", out userRaw) && !string.IsNullOrEmpty(userRaw))
		{
			user = NormalizeUser(userRaw);
			if (string.IsNullOrEmpty(user)) { user = null; }
			else if (!Regex.IsMatch(user, @"^[a-zA-Z0-9._@-]+$")) return 1;
		}

		string decPw = null;
		string pwEnc;
		if (pairs.TryGetValue("pw", out pwEnc) && !string.IsNullOrEmpty(pwEnc))
			decPw = DecodePwFromQuery(pwEnc);

		string baseDir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
		if (string.IsNullOrEmpty(baseDir)) return 1;
		if (isSftp)
		{
			string filezilla = FindFileZilla(baseDir);
			if (string.IsNullOrEmpty(filezilla)) return 1;
			string sftpUrl = BuildSftpUrl(targetHost, port, user);
			return StartProcess(filezilla, QuotePart(sftpUrl), Path.GetDirectoryName(filezilla)) ? 0 : 1;
		}
		string putty = Path.Combine(baseDir, "putty.exe");
		if (!File.Exists(putty)) return 1;

		bool usePw = !string.IsNullOrEmpty(decPw);

		if (usePw)
		{
			string pwfile = Path.Combine(Path.GetTempPath(), "blossom-ssh-pw-" + Guid.NewGuid().ToString("N") + ".txt");
			try
			{
				File.WriteAllText(pwfile, decPw + "\n", new UTF8Encoding(false));
			}
			catch
			{
				return 1;
			}
			var ap = new List<string>();
			ap.Add("-ssh");
			if (!string.IsNullOrEmpty(user))
			{
				ap.Add("-l");
				ap.Add(user);
			}
			ap.Add(targetHost);
			if (port != 22)
			{
				ap.Add("-P");
				ap.Add(port.ToString(System.Globalization.CultureInfo.InvariantCulture));
			}
			ap.Add("-pwfile");
			ap.Add(pwfile.Replace('\\', '/'));
			string del = pwfile;
			if (!StartProcess(putty, JoinArguments(ap), baseDir))
			{
				try { File.Delete(pwfile); } catch { }
				return 1;
			}
			ThreadPool.QueueUserWorkItem(_ =>
			{
				Thread.Sleep(15000);
				try { File.Delete(del); } catch { }
			});
			return 0;
		}

		var argParts = new List<string>();
		argParts.Add("-ssh");
		if (!string.IsNullOrEmpty(user))
		{
			argParts.Add("-l");
			argParts.Add(user);
		}
		argParts.Add(targetHost);
		if (port != 22)
		{
			argParts.Add("-P");
			argParts.Add(port.ToString(System.Globalization.CultureInfo.InvariantCulture));
		}
		return StartProcess(putty, JoinArguments(argParts), baseDir) ? 0 : 1;
	}

	private static string FindFileZilla(string baseDir)
	{
		string[] candidates = new string[]
		{
			Path.Combine(baseDir, "FileZilla.exe"),
			Path.Combine(baseDir, "filezilla", "FileZilla.exe"),
			Path.Combine(baseDir, "..", "filezilla", "FileZilla.exe"),
			Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "FileZilla FTP Client", "filezilla.exe"),
			Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "FileZilla FTP Client", "filezilla.exe")
		};
		foreach (string candidate in candidates)
		{
			try
			{
				string full = Path.GetFullPath(candidate);
				if (File.Exists(full)) return full;
			}
			catch { }
		}
		return null;
	}

	private static string BuildSftpUrl(string host, int port, string user)
	{
		string safeHost = host;
		if (safeHost.IndexOf(':') >= 0 && !safeHost.StartsWith("[", StringComparison.Ordinal))
			safeHost = "[" + safeHost + "]";
		string auth = string.IsNullOrEmpty(user) ? "" : Uri.EscapeDataString(user) + "@";
		string portPart = port > 0 && port != 22 ? ":" + port.ToString(System.Globalization.CultureInfo.InvariantCulture) : "";
		return "sftp://" + auth + safeHost + portPart + "/";
	}

	private static bool StartProcess(string fileName, string arguments, string workingDirectory)
	{
		try
		{
			var psi = new ProcessStartInfo
			{
				FileName = fileName,
				Arguments = arguments,
				UseShellExecute = false,
				WorkingDirectory = workingDirectory,
			};
			if (Process.Start(psi) == null) return false;
		}
		catch
		{
			return false;
		}
		return true;
	}

	private static Dictionary<string, string> ParseQuery(string q)
	{
		var d = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
		if (string.IsNullOrEmpty(q)) return d;
		foreach (string segment in q.Split('&'))
		{
			if (string.IsNullOrEmpty(segment)) continue;
			string[] kv = segment.Split(new char[] { '=' }, 2);
			string k = Uri.UnescapeDataString(kv[0]);
			string v = kv.Length > 1 ? Uri.UnescapeDataString(kv[1]) : string.Empty;
			d[k] = v;
		}
		return d;
	}

	private static string JoinArguments(IList<string> parts)
	{
		var sb = new StringBuilder();
		for (int i = 0; i < parts.Count; i++)
		{
			if (i > 0) sb.Append(' ');
			sb.Append(QuotePart(parts[i]));
		}
		return sb.ToString();
	}

	private static string QuotePart(string s)
	{
		if (string.IsNullOrEmpty(s)) return "\"\"";
		bool need = false;
		for (int i = 0; i < s.Length; i++)
		{
			char c = s[i];
			if (c == ' ' || c == '\t' || c == '\"') { need = true; break; }
		}
		if (!need) return s;
		return "\"" + s.Replace("\"", "\\\"") + "\"";
	}

}
