# H5 Media Kernel Manual Checklist

## Build
- [ ] `npm run check`
- [ ] `npm run test:media-kernel`
- [ ] `npm run build:chrome && npm run verify:chrome-package`

## Zero regression
- [ ] YouTube: 1-6 / C X Z / seek 正常；字幕等其它功能未坏
- [ ] Bilibili: 倍速与 seek 正常；CDN/字幕开关不受影响
- [ ] Douyin: >3x sticky 仍由原 guard 生效；不出现双重跳动

## Compat mode
- [ ] safe: 行为接近旧版 isolated
- [ ] compat: 至少 5 个先前失败的 H5 站，调速后 ≥3s 保持
- [ ] strict: 难站持续保持（若有样本）

## Frames
- [ ] iframe 内主视频可调速
- [ ] 无 video 的页面/frame 不抢快捷键

## Notes
| Site | Mode | Result | Notes |
|------|------|--------|-------|
|  |  |  |  |
