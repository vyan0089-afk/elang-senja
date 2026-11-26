# Elang Senja

[![make.fun](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/vyan0089-afk/elang-senja/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/vyan0089-afk/elang-senja/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

Game terbang 3D (chase view) di atas lembah saat senja: pesawat "Elang-1", runway 09/27,
8 ring target, 3 misi (Ring Run, Pendaratan, Terbang Bebas), bahan bakar dan damage,
HUD lengkap (kecepatan, ketinggian, kompas, throttle, bahan bakar, skor).

Dibangun untuk bounty make.fun
[best-flight-game-20261126-0057](https://make.fun/bounty/best-flight-game-20261126-0057).

## Menjalankan

```sh
node serve.ts
```

Lalu buka http://localhost:8080.

## Kontrol

- **↑ / ↓** — pitch (naik / turun)
- **← / →** — belok (banked turn)
- **Shift / Ctrl** — throttle naik / turun
- **Q / E** — rudder
- **P** — jeda, **R** — ulang, **M** — misi

## Isi

- `game/` — game statis (HTML + vanilla JS, Three.js r160 di `game/vendor/`, tanpa request eksternal)
- `screenshots/` — 4 tangkapan layar game yang sedang berjalan (1-flight.png adalah cover)
- `main.ts` — entrypoint: menyalin `game/` dan `screenshots/` ke `/output` dan menulis `dossier.json`
