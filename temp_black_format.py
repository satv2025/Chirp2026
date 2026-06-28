from pathlib import Path
import shutil
import subprocess
import tempfile
import struct
import sys
from fontTools.ttLib import TTFont

SOURCE_DIR = Path(r"F:\Chirp FONT\Chirp Sans")

MAKE_WOFF = True
MAKE_WOFF2 = True
MAKE_OTF = True
MAKE_EOT = True

FONTFORGE_CANDIDATES = [
    "fontforge",
    r"C:\Program Files\FontForgeBuilds\bin\fontforge.exe",
    r"C:\Program Files (x86)\FontForgeBuilds\bin\fontforge.exe",
    r"C:\Program Files\FontForge\bin\fontforge.exe",
    r"C:\Program Files (x86)\FontForge\bin\fontforge.exe",
]


def find_exe(candidates):
    for item in candidates:
        p = Path(item)
        if p.exists():
            return str(p)

        found = shutil.which(item)
        if found:
            return found

    return None


def save_woff(src_ttf: Path, out_file: Path):
    font = TTFont(src_ttf)
    font.flavor = "woff"
    font.save(out_file)
    font.close()


def save_woff2(src_ttf: Path, out_file: Path):
    font = TTFont(src_ttf)
    font.flavor = "woff2"
    font.save(out_file)
    font.close()


# ----------------------------
# EOT PURO PYTHON
# ----------------------------

def tag_value(tag: str) -> int:
    b = tag.encode("ascii")
    return (b[0] << 24) + (b[1] << 16) + (b[2] << 8) + b[3]


SFNT_TRUE = 0x00010000
SFNT_CFF = tag_value("OTTO")

TABLE_HEAD = tag_value("head")
TABLE_NAME = tag_value("name")
TABLE_OS2 = tag_value("OS/2")

EOT_VERSION = 0x00020001
EOT_MAGIC = 0x504C
EOT_DEFAULT_CHARSET = 0x01

EOT_HEADER_PACK = "<4L10B2BL2H7L18x"
SFNT_UNPACK = ">I4H"
TABLE_DIR_UNPACK = ">4I"
OS2_UNPACK = ">4xH2xH22x10B4L4xH14x2L"
HEAD_UNPACK = ">8xL"
NAME_RECORD_UNPACK = ">6H"

NAME_ID_FAMILY = 1
NAME_ID_STYLE = 2
NAME_ID_FULL = 4
NAME_ID_VERSION = 5

PLATFORM_MICROSOFT = 3
ENCODING_UNICODE_BMP = 1
LANG_EN_US = 0x0409


def get_table_directory(data: bytes):
    sfnt_size = struct.calcsize(SFNT_UNPACK)

    if len(data) < sfnt_size:
        raise ValueError("Font truncada o inválida.")

    sfnt_version, num_tables = struct.unpack(SFNT_UNPACK, data[:sfnt_size])[:2]

    if sfnt_version not in (SFNT_TRUE, SFNT_CFF):
        raise ValueError("No parece ser TTF/OTF SFNT válido.")

    table_dir = {}
    table_size = struct.calcsize(TABLE_DIR_UNPACK)

    for i in range(num_tables):
        start = sfnt_size + i * table_size
        end = start + table_size

        tag, checksum, offset, length = struct.unpack(TABLE_DIR_UNPACK, data[start:end])

        table_dir[tag] = {
            "checksum": checksum,
            "offset": offset,
            "length": length,
        }

    return table_dir


def read_name_records(name_table: bytes):
    count, storage_offset = struct.unpack(">2H", name_table[2:6])
    records = {}

    for i in range(count):
        start = 6 + i * 12
        end = start + 12

        platform_id, encoding_id, language_id, name_id, length, offset = struct.unpack(
            NAME_RECORD_UNPACK,
            name_table[start:end],
        )

        if (
            platform_id == PLATFORM_MICROSOFT
            and encoding_id == ENCODING_UNICODE_BMP
            and language_id == LANG_EN_US
        ):
            records[name_id] = {
                "offset": offset,
                "length": length,
            }

    return records, storage_offset


def make_eot_name_block(font_data: bytes, name_dir: dict):
    name_offset = name_dir["offset"]
    name_length = name_dir["length"]

    name_table = font_data[name_offset:name_offset + name_length]
    records, storage_offset = read_name_records(name_table)

    output = []

    for name_id in [NAME_ID_FAMILY, NAME_ID_STYLE, NAME_ID_VERSION, NAME_ID_FULL]:
        rec = records.get(name_id)

        if not rec:
            output.append(struct.pack("<HH", 0, 0))
            continue

        start = name_offset + storage_offset + rec["offset"]
        end = start + rec["length"]
        raw_utf16_be = font_data[start:end]

        chars = struct.unpack(">" + "H" * (len(raw_utf16_be) // 2), raw_utf16_be)

        # largo + string UTF-16LE + padding
        output.append(
            struct.pack(
                "<H" + "H" * len(chars) + "H",
                len(raw_utf16_be),
                *chars,
                0,
            )
        )

    return b"".join(output)


def save_eot(src_ttf: Path, out_file: Path):
    font_data = src_ttf.read_bytes()
    table_dir = get_table_directory(font_data)

    for required in [TABLE_HEAD, TABLE_NAME, TABLE_OS2]:
        if required not in table_dir:
            raise ValueError(f"Falta tabla requerida para EOT en {src_ttf.name}")

    os2_dir = table_dir[TABLE_OS2]
    os2_offset = os2_dir["offset"]
    os2_size = struct.calcsize(OS2_UNPACK)

    os2_fields = struct.unpack(
        OS2_UNPACK,
        font_data[os2_offset:os2_offset + os2_size],
    )

    weight = os2_fields[0]
    fs_type = os2_fields[1]
    panose = list(os2_fields[2:12])
    unicode_ranges = list(os2_fields[12:16])
    fs_selection = os2_fields[16]
    codepage_ranges = list(os2_fields[17:19])

    italic = 1 if fs_selection & 0x01 else 0

    head_dir = table_dir[TABLE_HEAD]
    head_offset = head_dir["offset"]
    head_size = struct.calcsize(HEAD_UNPACK)

    checksum_adjustment = struct.unpack(
        HEAD_UNPACK,
        font_data[head_offset:head_offset + head_size],
    )[0]

    name_block = make_eot_name_block(font_data, table_dir[TABLE_NAME])

    # RootString vacío: sin restricción de dominio.
    root_string = struct.pack("<H", 0)

    font_data_size = len(font_data)

    eot_size = (
        struct.calcsize(EOT_HEADER_PACK)
        + len(name_block)
        + len(root_string)
        + font_data_size
    )

    fixed_header = struct.pack(
        EOT_HEADER_PACK,
        *(
            [eot_size, font_data_size, EOT_VERSION, 0]
            + panose
            + [EOT_DEFAULT_CHARSET, italic]
            + [weight, fs_type, EOT_MAGIC]
            + unicode_ranges
            + codepage_ranges
            + [checksum_adjustment]
        ),
    )

    out_file.write_bytes(fixed_header + name_block + root_string + font_data)


# ----------------------------
# OTF CON FONTFORGE
# ----------------------------

def generate_otf_with_fontforge(src_ttf: Path, out_otf: Path):
    fontforge_exe = find_exe(FONTFORGE_CANDIDATES)

    if not fontforge_exe:
        raise RuntimeError(
            "No encontré FontForge. Instalalo con:\n"
            "winget install -e --id FontForge.FontForge\n\n"
            "Después cerrá y abrí la terminal de nuevo."
        )

    stem = src_ttf.stem  # Ej: Chirp Sans ExtraBold
    style = stem.replace("Chirp Sans ", "")  # Ej: ExtraBold

    family_name = "Chirp Sans"
    full_name = stem

    # PostScript interno: sin espacios.
    # Ej: ChirpSansExtraBold
    postscript_name = "ChirpSans" + style.replace(" ", "")

    script = f'''
import fontforge

font = fontforge.open({str(src_ttf)!r})

# Nombre PostScript interno: SIN espacios
font.fontname = {postscript_name!r}

# Nombres visibles: CON espacios
font.familyname = {family_name!r}
font.fullname = {full_name!r}

font.generate({str(out_otf)!r})
font.close()
'''

    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False, encoding="utf-8") as tmp:
        tmp.write(script)
        tmp_script = Path(tmp.name)

    try:
        subprocess.run(
            [fontforge_exe, "-lang=py", "-script", str(tmp_script)],
            check=True,
        )
    finally:
        try:
            tmp_script.unlink()
        except Exception:
            pass


# ----------------------------
# MAIN
# ----------------------------

def main():
    fonts = sorted(SOURCE_DIR.glob("Chirp Sans *.ttf"))

    if not fonts:
        print("No encontré TTF en:", SOURCE_DIR)
        sys.exit(1)

    print("Carpeta:", SOURCE_DIR)
    print("Formatos: TTF, OTF, EOT, WOFF, WOFF2")
    print("Sin subcarpetas.\n")

    for src in fonts:
        stem = src.stem

        print(f"Procesando: {src.name}")

        if MAKE_WOFF:
            out = SOURCE_DIR / f"{stem}.woff"
            save_woff(src, out)
            print(f"  OK WOFF:  {out.name}")

        if MAKE_WOFF2:
            out = SOURCE_DIR / f"{stem}.woff2"
            save_woff2(src, out)
            print(f"  OK WOFF2: {out.name}")

        if MAKE_EOT:
            out = SOURCE_DIR / f"{stem}.eot"
            save_eot(src, out)
            print(f"  OK EOT:   {out.name}")

        if MAKE_OTF:
            out = SOURCE_DIR / f"{stem}.otf"
            generate_otf_with_fontforge(src, out)
            print(f"  OK OTF:   {out.name}")

        print()

    print("LISTO. Todo quedó acá:")
    print(SOURCE_DIR)


if __name__ == "__main__":
    main()