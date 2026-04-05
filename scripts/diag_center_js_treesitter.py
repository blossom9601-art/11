from __future__ import annotations

from pathlib import Path

from tree_sitter import Language, Parser
import tree_sitter_javascript as tsjs


def iter_problem_nodes(node):
    # Yield ERROR and missing nodes in a pre-order walk
    if node.type == "ERROR" or getattr(node, "is_missing", False):
        yield node
    for child in node.children:
        if child.has_error or child.type == "ERROR" or getattr(child, "is_missing", False):
            yield from iter_problem_nodes(child)


def main() -> int:
    js_path = Path(r"c:\Users\ME\Desktop\blossom\static\js\9.category\9-5.company\9-5-1.center\1.center_list.js")
    src_bytes = js_path.read_bytes()

    # tree_sitter_javascript.language() returns a low-level handle; wrap to Language.
    lang = Language(tsjs.language())  # type: ignore[arg-type]

    try:
        parser = Parser(lang)
    except TypeError:
        parser = Parser()
        try:
            parser.language = lang  # type: ignore[attr-defined]
        except Exception:
            parser.set_language(lang)  # type: ignore[attr-defined]

    tree = parser.parse(src_bytes)
    root = tree.root_node

    print("root.has_error:", root.has_error)
    if not root.has_error:
        print("OK: no syntax errors detected by tree-sitter")
        return 0

    problems = list(iter_problem_nodes(root))
    print("problem_nodes:", len(problems))
    if not problems:
        # Some parse errors might not surface as explicit ERROR nodes.
        print("Parse tree reports errors, but no explicit ERROR nodes were found.")
        return 2

    first = problems[0]
    sp = first.start_point  # (row, col), 0-based
    ep = first.end_point
    print("first_problem:", first.type, "missing=" + str(getattr(first, "is_missing", False)))
    print("range:", (sp[0] + 1, sp[1] + 1), "->", (ep[0] + 1, ep[1] + 1))

    text = src_bytes.decode("utf-8", errors="replace").splitlines()
    line0 = sp[0]
    start = max(0, line0 - 5)
    end = min(len(text), line0 + 6)
    for i in range(start, end):
        mark = "-->" if i == line0 else "   "
        print(f"{mark} {i+1:5d}: {text[i]}")

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
