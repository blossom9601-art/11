import argparse
import os
import shutil
import subprocess
import sys
from datetime import datetime


def _repo_root() -> str:
    return os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def _timestamped_outfile(alias_path: str) -> str:
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    if not alias_path:
        return f"pytest_{ts}.txt"

    p = alias_path
    if p.endswith("_latest.txt"):
        return p[: -len("_latest.txt")] + f"_{ts}.txt"
    if p.endswith(".txt"):
        return p[: -len(".txt")] + f"_{ts}.txt"
    return f"{p}_{ts}.txt"


def _tail_lines(path: str, tail: int) -> list[str]:
    if tail <= 0:
        return []

    # Efficient tail for typical log sizes
    try:
        with open(path, "rb") as f:
            f.seek(0, os.SEEK_END)
            end = f.tell()
            block = 4096
            data = b""
            pos = end
            while pos > 0 and data.count(b"\n") <= tail + 1:
                read_size = block if pos >= block else pos
                pos -= read_size
                f.seek(pos)
                data = f.read(read_size) + data
            text = data.decode("utf-8", errors="replace")
    except OSError:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            text = f.read()

    lines = text.splitlines()
    return lines[-tail:]


def main() -> int:
    parser = argparse.ArgumentParser(description="Run pytest and capture full output to a UTF-8 file, printing only the tail.")
    parser.add_argument("--python-exe", default=sys.executable, help="Python executable to run pytest with (default: current interpreter)")
    parser.add_argument("--out-file", default="pytest_full_latest.txt", help="Alias output file to refresh (default: pytest_full_latest.txt)")
    parser.add_argument("--tail", type=int, default=40, help="How many lines of tail to print (default: 40)")
    parser.add_argument("--test-path", default="", help="Optional test path (e.g. tests/test_x.py)")
    parser.add_argument("--keyword", default="", help="Optional pytest -k keyword expression")
    # NOTE: We intentionally use REMAINDER so arguments like "-x" or "-ra" are treated
    # as values for pytest, not as options for this wrapper script.
    parser.add_argument("--extra-args", nargs=argparse.REMAINDER, default=[], help="Extra pytest args appended at the end")
    parser.add_argument(
        "--pytest-args",
        nargs="*",
        default=["-m", "pytest", "-q", "-p", "no:warnings"],
        help="Args passed to python before optional test path/keyword (default: -m pytest -q -p no:warnings)",
    )

    # Use parse_known_args so callers can forward arbitrary pytest flags (e.g. -x, -ra)
    # without this wrapper rejecting them.
    args, unknown_args = parser.parse_known_args()

    # If the user included an explicit "--" (common when forwarding args), drop it.
    if args.extra_args and args.extra_args[0] == "--":
        args.extra_args = args.extra_args[1:]

    # VS Code tasks often pass pytest flags as separate args; argparse may classify them
    # as unknown. Forward them to pytest.
    if unknown_args:
        args.extra_args = list(args.extra_args) + list(unknown_args)

    repo_root = _repo_root()
    os.chdir(repo_root)

    if not os.path.exists(args.python_exe):
        raise SystemExit(f"Python executable not found: {args.python_exe}")

    pytest_cmd: list[str] = [args.python_exe] + list(args.pytest_args)

    if args.test_path.strip():
        pytest_cmd.append(args.test_path.strip())

    if args.keyword.strip():
        pytest_cmd += ["-k", args.keyword.strip()]

    if args.extra_args:
        pytest_cmd += list(args.extra_args)

    run_outfile = _timestamped_outfile(args.out_file)

    # Run pytest and capture everything
    with open(run_outfile, "w", encoding="utf-8", errors="replace", newline="") as out:
        proc = subprocess.run(pytest_cmd, stdout=out, stderr=subprocess.STDOUT)

    # Best-effort refresh stable alias file
    try:
        shutil.copyfile(run_outfile, args.out_file)
    except OSError:
        print(f"[pytest-capture] WARNING: Could not refresh alias '{args.out_file}' (likely locked). Using '{run_outfile}'.")

    # Print tail
    for line in _tail_lines(run_outfile, args.tail):
        print(line)

    print(f"[pytest-capture] DONE -> {run_outfile}")
    print(f"[pytest-capture] ALIAS -> {args.out_file}")

    return int(proc.returncode)


if __name__ == "__main__":
    raise SystemExit(main())
