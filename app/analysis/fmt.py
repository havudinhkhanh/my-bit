"""Định dạng số kiểu Việt Nam trong câu chữ: 1.234,5 (dấu chấm ngăn nghìn, dấu phẩy thập phân)."""


def vn(x, spec: str = ",.1f") -> str:
    try:
        s = format(float(x), spec if "," in spec else "," + spec.lstrip(",") if not spec.startswith("+") else "+," + spec[1:])
    except (TypeError, ValueError):
        return "—"
    return s.replace(",", "\x00").replace(".", ",").replace("\x00", ".")
