# +1 Loot to Forge — client

A Roblox-style multiplayer game in the browser, built with React Three Fiber, Rapier
physics, Bloxity avatars and a Colyseus backend (`../-loot-to-forge-server`).

Walk through the castle's Dungeon gate into a long corridor of 20 stages. In each
stage, defeat every enemy to open the gate to the next one and free the caged ore
nodes. Pick up what drops (press E) and it flies into the
backpack on your back. Bring the ores to the Forge and roll for weapons and armor
from Common up to Secret. Train your power, buy bigger bags and rebirth for
multipliers, with up to 8 players per server.

## Run

```bash
# terminal 1 — game server
cd ../-loot-to-forge-server && npm install && npm run dev

# terminal 2 — this client
cp .env.example .env    # set VITE_GAME_SLUG; VITE_SERVER_URL defaults to :2567
npm install
npm run dev
```

## Controls

| Key | Action |
| --- | --- |
| W / S · A / D | Walk forward / back · turn the camera left / right |
| Space / Shift | Jump / sprint |
| Click or F | Attack (auto-targets the nearest enemy, ore or dummy). Quick clicks chain a 5-move combo: chop, sweep, uppercut, thrust, spin. Standing on an unlocked training pad attacks its dummy by itself |
| Q | Weapon skill (Dash, Whirlwind, Earthsplitter, Flurry), plus a flying energy shot |
| E | Pick up loot or use a station (Forge, Sell, Upgrade…) |
| H | Home: back to the lobby |
| N / K / X | Sound on/off / Free gift / Switch to your best Sword or Axe |
| Right-drag / scroll | Camera |
| B / G / M / R / T / J / O | Backpack / Index / Shop / Rebirth / Teleport / Quests / Settings (again to close); each button shows its key. Teleport has no button, only the key |
| Tab | Players on this server |
| / or Enter | Chat |

## Layout

```
src/
  net/          Colyseus connection (network.js) and UI state (store.js)
  game/         The 3D game
    world/      Hub castle, Forge, the dungeon corridor (Dungeon.jsx), boards, props
    entities/   Remote players, enemies, ore nodes, loot drops, bags, weapons
    Player.jsx  Local player: movement, combat, skills, interactions
    Effects.jsx Particles, slashes, shockwaves, damage numbers
    textures.js Procedural "studs" textures and materials
  ui/           HUD, panels (Forge, Backpack, Index, Shop…), title screen, chat
  audio/        Synthesised sound effects and music (Web Audio, no files)
  shared/       gameData.js — copied from the server, do not edit here
```

Everything visual is generated in code (textures, icons, weapons, sounds), so there
are no binary assets to manage. The only exceptions are the Bloxity avatar files,
which load from their CDN.
