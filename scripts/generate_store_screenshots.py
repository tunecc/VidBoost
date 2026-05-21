#!/usr/bin/env python3
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageChops, ImageColor, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ASSETS_DIR = ROOT / "assets"
OUTPUT_DIR = ROOT / "outputs" / "store-screenshots"
CANVAS = (1280, 800)

TITLE_FONT = "/System/Library/Fonts/Hiragino Sans GB.ttc"
BODY_FONT = "/System/Library/Fonts/Hiragino Sans GB.ttc"


@dataclass(frozen=True)
class SlideSpec:
    filename: str
    kicker: str
    title: str
    body: str
    bullets: tuple[str, ...]
    palette: tuple[str, str]
    accents: tuple[str, str]
    cards: tuple[dict, ...]


SLIDES: tuple[SlideSpec, ...] = (
    SlideSpec(
        filename="vidboost-store-01-overview.jpg",
        kicker="VIDBOOST",
        title="一个插件，统一管理视频增强体验",
        body="把倍速、自动暂停、YouTube / Bilibili 专属增强集中到同一个轻量入口。",
        bullets=(
            "统一开关与站点分区设置",
            "减少脚本冲突与分散配置",
            "适合日常刷视频、学习和追番场景",
        ),
        palette=("#F6FBFF", "#E6F0FF"),
        accents=("#3B82F6", "#22C55E"),
        cards=(
            {"asset": "light_mode.png", "box": (500, 40, 740, 720), "mode": "contain", "radius": 34},
        ),
    ),
    SlideSpec(
        filename="vidboost-store-02-youtube.jpg",
        kicker="YOUTUBE",
        title="YouTube 常用痛点，一次处理干净",
        body="针对原生快捷键冲突、多音轨、会员视频和 CDN 观察做了专门优化。",
        bullets=(
            "屏蔽 0-9 原生跳进度，保留倍速快捷键",
            "自动切回 Original / 原始音轨",
            "支持会员视频过滤与 CDN 国家展示",
        ),
        palette=("#FFF7F7", "#FFE8EA"),
        accents=("#EF4444", "#F97316"),
        cards=(
            {"asset": "youtube.png", "box": (560, 70, 300, 640), "mode": "contain", "radius": 28},
            {"asset": "youtube_filter.png", "box": (880, 360, 320, 240), "mode": "contain", "radius": 24},
        ),
    ),
    SlideSpec(
        filename="vidboost-store-03-bilibili.jpg",
        kicker="BILIBILI",
        title="B 站增强不只是一两个开关",
        body="自动中文字幕、空格翻页拦截、CDN 节点切换与测速都放进同一套配置里。",
        bullets=(
            "自动开启中文字幕，优先 AI 字幕",
            "屏蔽空格误滚动，更接近原生播放控制",
            "支持 CDN 节点切换、测速与排序查看",
        ),
        palette=("#F4FCFF", "#DDF6FF"),
        accents=("#06B6D4", "#2563EB"),
        cards=(
            {"asset": "bilibili.png", "box": (640, 80, 270, 250), "mode": "contain", "radius": 24},
            {"asset": "bilibili_auto_subtitle.png", "box": (930, 90, 250, 230), "mode": "contain", "radius": 24},
            {"asset": "bilibili_cdn.png", "box": (640, 360, 540, 250), "mode": "contain", "radius": 24},
        ),
    ),
    SlideSpec(
        filename="vidboost-store-04-controls.jpg",
        kicker="DAILY FLOW",
        title="围绕高频操作做细节优化",
        body="不是堆功能，而是把真正常用的操作做得更顺手、更稳定。",
        bullets=(
            "统一的 h5player 快捷倍速控制",
            "后台标签自动暂停，回到页面自动恢复",
            "禁用双击全屏，减少误触和中断",
        ),
        palette=("#FCFAFF", "#EEE8FF"),
        accents=("#7C3AED", "#EC4899"),
        cards=(
            {"asset": "h5_setting.png", "box": (560, 40, 220, 330), "mode": "contain", "radius": 26},
            {"asset": "auto_pause.png", "box": (820, 40, 220, 330), "mode": "contain", "radius": 26},
            {"asset": "fastPause.png", "box": (590, 450, 560, 170), "mode": "contain", "radius": 26},
        ),
    ),
    SlideSpec(
        filename="vidboost-store-05-theme.jpg",
        kicker="POLISHED UI",
        title="设置面板清爽，明暗主题都能用",
        body="保留轻量、分组清晰的交互结构，功能多但不把面板做得拥挤难找。",
        bullets=(
            "模块分区明确，适合长期维护",
            "浅色与深色界面都保持一致层级",
            "Chrome / Edge / Firefox 共用一套核心体验",
        ),
        palette=("#F7F8FC", "#E6EBF8"),
        accents=("#111827", "#4F46E5"),
        cards=(
            {"asset": "light_mode.png", "box": (600, 40, 260, 690), "mode": "contain", "radius": 30},
            {"asset": "dark_mode.png", "box": (900, 40, 260, 690), "mode": "contain", "radius": 30},
        ),
    ),
)


def hex_color(value: str) -> tuple[int, int, int]:
    return ImageColor.getrgb(value)


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    font_path = TITLE_FONT if bold else BODY_FONT
    try:
        return ImageFont.truetype(font_path, size=size)
    except OSError:
        return ImageFont.load_default()


def vertical_gradient(size: tuple[int, int], top: str, bottom: str) -> Image.Image:
    width, height = size
    top_rgb = hex_color(top)
    bottom_rgb = hex_color(bottom)
    image = Image.new("RGB", size)
    draw = ImageDraw.Draw(image)
    for y in range(height):
        mix = y / max(height - 1, 1)
        color = tuple(
            round(top_rgb[i] * (1 - mix) + bottom_rgb[i] * mix) for i in range(3)
        )
        draw.line((0, y, width, y), fill=color)
    return image


def draw_glow(base: Image.Image, xy: tuple[int, int], radius: int, color: str, alpha: int) -> None:
    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    x, y = xy
    draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=hex_color(color) + (alpha,))
    overlay = overlay.filter(ImageFilter.GaussianBlur(radius=48))
    base.alpha_composite(overlay)


def rounded_rect_mask(size: tuple[int, int], radius: int) -> Image.Image:
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, size[0], size[1]), radius=radius, fill=255)
    return mask


def resize_contain(image: Image.Image, box_size: tuple[int, int]) -> Image.Image:
    image = image.copy()
    image.thumbnail(box_size, Image.Resampling.LANCZOS)
    return image


def crop_to_fill(image: Image.Image, box_size: tuple[int, int]) -> Image.Image:
    src = image.copy()
    src_ratio = src.width / src.height
    box_ratio = box_size[0] / box_size[1]
    if src_ratio > box_ratio:
        new_height = box_size[1]
        new_width = round(new_height * src_ratio)
    else:
        new_width = box_size[0]
        new_height = round(new_width / src_ratio)
    src = src.resize((new_width, new_height), Image.Resampling.LANCZOS)
    left = (new_width - box_size[0]) // 2
    top = (new_height - box_size[1]) // 2
    return src.crop((left, top, left + box_size[0], top + box_size[1]))


def flatten_alpha(image: Image.Image, bg: tuple[int, int, int]) -> Image.Image:
    if image.mode != "RGBA":
        return image.convert("RGB")
    background = Image.new("RGBA", image.size, bg + (255,))
    return Image.alpha_composite(background, image).convert("RGB")


def add_card(base: Image.Image, asset_name: str, box: tuple[int, int, int, int], radius: int, mode: str) -> None:
    x, y, w, h = box
    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    shadow = Image.new("RGBA", (w + 80, h + 80), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.rounded_rectangle((40, 30, w + 20, h + 20), radius=radius + 10, fill=(15, 23, 42, 46))
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=18))
    overlay.alpha_composite(shadow, (x - 20, y - 18))

    card = Image.new("RGBA", (w, h), (255, 255, 255, 238))
    border = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    border_draw = ImageDraw.Draw(border)
    border_draw.rounded_rectangle((0, 0, w - 1, h - 1), radius=radius, outline=(255, 255, 255, 210), width=2)

    asset = Image.open(ASSETS_DIR / asset_name).convert("RGBA")
    content_box = (w - 36, h - 36)
    placed = resize_contain(asset, content_box) if mode == "contain" else crop_to_fill(asset, content_box)
    content = Image.new("RGBA", content_box, (255, 255, 255, 0))
    offset = ((content_box[0] - placed.width) // 2, (content_box[1] - placed.height) // 2)
    content.alpha_composite(placed, offset)
    card.alpha_composite(content, (18, 18))
    card.alpha_composite(border)

    masked = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    masked.paste(card, mask=rounded_rect_mask((w, h), radius))
    overlay.alpha_composite(masked, (x, y))
    base.alpha_composite(overlay)


def draw_text_block(draw: ImageDraw.ImageDraw, spec: SlideSpec) -> None:
    kicker_font = load_font(26, bold=True)
    title_font = load_font(46, bold=True)
    body_font = load_font(24)
    bullet_font = load_font(25)

    left = 86
    draw.text((left, 78), spec.kicker, font=kicker_font, fill=hex_color(spec.accents[0]))
    title_end_y = draw_multiline(
        draw,
        spec.title,
        left,
        124,
        430,
        title_font,
        (17, 24, 39),
        spacing=8,
    )
    draw_multiline(draw, spec.body, left, title_end_y + 22, 430, body_font, (75, 85, 99), spacing=10)

    bullet_y = 330
    for bullet in spec.bullets:
        draw_bullet(draw, left, bullet_y, bullet, bullet_font, spec.accents[1])
        bullet_y += 88


def draw_bullet(
    draw: ImageDraw.ImageDraw,
    left: int,
    top: int,
    text: str,
    font: ImageFont.ImageFont,
    accent: str,
) -> None:
    draw.rounded_rectangle((left, top + 9, left + 18, top + 27), radius=9, fill=hex_color(accent))
    draw_multiline(draw, text, left + 34, top, 360, font, (31, 41, 55), spacing=8)


def draw_multiline(
    draw: ImageDraw.ImageDraw,
    text: str,
    left: int,
    top: int,
    max_width: int,
    font: ImageFont.ImageFont,
    fill: tuple[int, int, int],
    spacing: int,
) -> int:
    lines = wrap_text(draw, text, max_width, font)
    y = top
    for line in lines:
        draw.text((left, y), line, font=font, fill=fill)
        bbox = draw.textbbox((left, y), line, font=font)
        y += (bbox[3] - bbox[1]) + spacing
    return y - spacing if lines else top


def wrap_text(
    draw: ImageDraw.ImageDraw,
    text: str,
    max_width: int,
    font: ImageFont.ImageFont,
) -> list[str]:
    lines: list[str] = []
    current = ""
    for char in text:
        if char == "\n":
            if current:
                lines.append(current)
                current = ""
            continue
        candidate = current + char
        width = draw.textbbox((0, 0), candidate, font=font)[2]
        if current and width > max_width:
            lines.append(current)
            current = char
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines


def add_logo_chip(base: Image.Image, accent: str) -> None:
    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    x, y, w, h = 86, 624, 380, 94
    draw.rounded_rectangle((x, y, x + w, y + h), radius=28, fill=(255, 255, 255, 218))
    draw.rounded_rectangle((x + 22, y + 22, x + 50, y + 50), radius=14, fill=hex_color(accent))
    draw.rounded_rectangle((x + 34, y + 34, x + 62, y + 62), radius=14, outline=(255, 255, 255, 180), width=4)
    brand_font = load_font(34, bold=True)
    sub_font = load_font(18)
    draw.text((x + 82, y + 18), "VidBoost", font=brand_font, fill=(17, 24, 39))
    draw.text((x + 82, y + 56), "Video toolkit for everyday watching", font=sub_font, fill=(100, 116, 139))
    base.alpha_composite(overlay)


def render_slide(spec: SlideSpec) -> Path:
    rgb_background = vertical_gradient(CANVAS, spec.palette[0], spec.palette[1]).convert("RGBA")
    draw_glow(rgb_background, (1110, 96), 170, spec.accents[0], 135)
    draw_glow(rgb_background, (956, 708), 200, spec.accents[1], 110)
    draw_glow(rgb_background, (408, 92), 120, "#FFFFFF", 160)

    draw = ImageDraw.Draw(rgb_background)
    draw_text_block(draw, spec)
    add_logo_chip(rgb_background, spec.accents[0])

    for card in spec.cards:
        add_card(
            rgb_background,
            card["asset"],
            card["box"],
            radius=card["radius"],
            mode=card.get("mode", "contain"),
        )

    result = flatten_alpha(rgb_background, hex_color(spec.palette[0]))
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUTPUT_DIR / spec.filename
    result.save(out_path, format="JPEG", quality=94, subsampling=0, optimize=True)
    return out_path


def verify_image(path: Path) -> dict[str, object]:
    with Image.open(path) as image:
        return {
            "name": path.name,
            "mode": image.mode,
            "size": image.size,
            "has_alpha": "A" in image.getbands(),
            "format": image.format,
        }


def main() -> None:
    paths = [render_slide(spec) for spec in SLIDES]
    for report in map(verify_image, paths):
        print(
            f"{report['name']}: format={report['format']} size={report['size'][0]}x{report['size'][1]} "
            f"mode={report['mode']} alpha={report['has_alpha']}"
        )


if __name__ == "__main__":
    main()
