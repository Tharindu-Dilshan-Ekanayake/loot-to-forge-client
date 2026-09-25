import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import {
  AdditiveBlending,
  BoxGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three'

import { getRoom } from '../net/network'
import { useGame } from '../net/store'
import { formatNum, gateZ, ORES, stageById, WEAPONS } from '../shared/gameData'
import { DUNGEON_THEMES } from './world/dungeonThemes'
import { fx, local } from './bus'
import { floatText } from './labels'
import { glowTexture } from './textures'

const cube = new BoxGeometry(1, 1, 1)
const ring = new RingGeometry(0.85, 1, 48)
const arc = new RingGeometry(1.1, 1.9, 24, 1, -1.25, 2.5)
const pillar = new CylinderGeometry(1, 1, 1, 20, 1, true)
const orb = new SphereGeometry(1, 12, 10)
/** The Q shot's spinning blade: a thick crescent, and a thin one for its white edge. */
const crescent = new RingGeometry(0.9, 2.1, 40, 1, 0, Math.PI * 1.25)
const crescentEdge = new RingGeometry(1.85, 2.15, 40, 1, 0, Math.PI * 1.25)
const _forward = new Vector3(0, 0, 1)
/** Scratch axis for rolling slash arcs about the swing direction. */
const _facing = new Vector3()

/** What each ranged enemy fires: arrows fly flat and fast, magic is a glowing orb. */
const SHOTS = {
  archer: { arrow: true, color: '#8a5a30' },
  archer2: { arrow: true, color: '#5a3a1e' },
  crossbow: { arrow: true, color: '#3a3d48' },
  skelarcher: { arrow: true, color: '#e8e4d8' },
  icewisp: { color: '#8ff8ff' },
  voideye: { color: '#c64dff' },
  firespirit: { color: '#ff7a2e' },
  goblinshaman: { color: '#6dff4a' },
  goblinwarlock: { color: '#b35bff' },
  junglehunter: { arrow: true, color: '#6b4a2a' },
  jelly: { color: '#ff7ae0' },
  thunderbird: { color: '#ffe23b' },
  angelarcher: { arrow: true, color: '#ffd23b' },
  drake: { color: '#ff7a1f' },
  celestialseraph: { color: '#ffe07a' },
}

function basic(color, additive = true) {
  return new MeshBasicMaterial({
    color,
    transparent: true,
    depthWrite: false,
    blending: additive ? AdditiveBlending : undefined,
    side: DoubleSide,
  })
}

/**
 * Pooled-by-lifetime particle effects. Each spawn builds a few meshes under one
 * group and an update function; the group is removed when its life runs out.
 */
export function Effects() {
  const root = useRef()
  const live = useRef([])
  const getThree = useThree((s) => s.get)

  useEffect(() => {
    const add = (life, build) => {
      const g = new Group()
      const update = build(g)
      root.current?.add(g)
      live.current.push({ g, life, age: 0, update })
    }

    const burst = (pos, color, { count = 10, speed = 5, size = 0.16, life = 0.55, gravity = 14, up = 3 } = {}) =>
      add(life, (g) => {
        const m = basic(color, false)
        const parts = Array.from({ length: count }, () => {
          const mesh = new Mesh(cube, m)
          mesh.scale.setScalar(size * (0.6 + Math.random() * 0.8))
          mesh.position.copy(pos)
          g.add(mesh)
          const a = Math.random() * Math.PI * 2
          const v = new Vector3(Math.cos(a) * speed * Math.random(), up + Math.random() * speed, Math.sin(a) * speed * Math.random())
          return { mesh, v }
        })
        return (t, dt) => {
          for (const p of parts) {
            p.v.y -= gravity * dt
            p.mesh.position.addScaledVector(p.v, dt)
            p.mesh.rotation.x += dt * 8
            p.mesh.rotation.y += dt * 6
          }
          m.opacity = 1 - t
        }
      })

    const shock = (pos, color, radius = 6, life = 0.6) =>
      add(life, (g) => {
        const m = basic(color)
        const mesh = new Mesh(ring, m)
        mesh.rotation.x = -Math.PI / 2
        mesh.position.set(pos.x, pos.y + 0.1, pos.z)
        g.add(mesh)
        return (t) => {
          mesh.scale.setScalar(0.5 + t * radius)
          m.opacity = (1 - t) * 0.9
        }
      })

    const column = (pos, color, life = 1.3) =>
      add(life, (g) => {
        const m = basic(color)
        const mesh = new Mesh(pillar, m)
        mesh.position.set(pos.x, pos.y, pos.z)
        g.add(mesh)
        return (t) => {
          mesh.scale.set(1.3 - t * 0.6, 2 + t * 14, 1.3 - t * 0.6)
          mesh.position.y = pos.y + (2 + t * 14) / 2
          m.opacity = (1 - t) * 0.55
        }
      })

    /** `tilt` rolls the arc about the facing: 0 flat sweep, ±1.3 near-vertical. */
    const slash = (pos, ry, color, big = false, tilt = (Math.random() - 0.5) * 0.4) =>
      add(0.28, (g) => {
        // A wide coloured arc with a thinner white-hot edge riding inside it.
        const m = basic(color)
        const coreM = basic('#ffffff')
        const mesh = new Mesh(arc, m)
        const core = new Mesh(arc, coreM)
        for (const x of [mesh, core]) {
          x.rotation.x = -Math.PI / 2
          x.rotation.z = ry - Math.PI / 2
        }
        g.position.set(pos.x, pos.y + 0.2, pos.z)
        g.quaternion.setFromAxisAngle(_facing.set(Math.sin(ry), 0, Math.cos(ry)), tilt)
        g.add(mesh, core)
        const k = big ? 1.9 : 1.35
        return (t) => {
          mesh.scale.setScalar(k * (0.8 + t * 0.55))
          core.scale.set(k * (0.86 + t * 0.5), k * (0.86 + t * 0.5), 1)
          const sweep = ry - Math.PI / 2 - (t - 0.5) * 1.6
          mesh.rotation.z = sweep
          core.rotation.z = sweep + 0.05
          m.opacity = (1 - t) * 0.9
          coreM.opacity = (1 - t * 1.4) * 0.8
        }
      })

    /**
     * Sword impact: a camera-facing starburst (white core, coloured halo, eight
     * rays and an expanding ring) that flashes and is gone in a quarter second.
     */
    const impact = (pos, color, big = false) =>
      add(big ? 0.34 : 0.26, (g) => {
        g.position.copy(pos)
        g.quaternion.copy(getThree().camera.quaternion)
        g.rotation.z += Math.random() * Math.PI
        const k = big ? 1.5 : 1
        const coreM = basic('#ffffff')
        const haloM = basic(color)
        const rayM = basic('#ffffff')
        const ringM = basic(color)
        const core = new Mesh(orb, coreM)
        const halo = new Mesh(orb, haloM)
        const ringMesh = new Mesh(ring, ringM)
        g.add(halo, core, ringMesh)
        const rays = Array.from({ length: 4 }, (_, i) => {
          const r = new Mesh(cube, rayM)
          r.rotation.z = (i * Math.PI) / 4
          r.userData.len = (i % 2 ? 1.5 : 2.4) * k
          g.add(r)
          return r
        })
        return (t) => {
          const pop = t < 0.25 ? t / 0.25 : 1
          core.scale.setScalar(0.35 * k * pop * (1 - t * 0.6))
          halo.scale.setScalar(0.75 * k * (0.5 + pop * 0.7))
          for (const r of rays) r.scale.set(0.09 * k * (1 - t), r.userData.len * (0.4 + pop * 0.8), 0.01)
          ringMesh.scale.setScalar(k * (0.3 + t * 1.6))
          coreM.opacity = 1 - t
          haloM.opacity = (1 - t) * 0.55
          rayM.opacity = 1 - t * t
          ringM.opacity = (1 - t) * 0.8
        }
      })

    /** Hot streaks thrown off a hit, stretched along their flight. */
    const streaks = (pos, color, count = 10) =>
      add(0.42, (g) => {
        const m = basic(color)
        const parts = Array.from({ length: count }, () => {
          const mesh = new Mesh(cube, m)
          const v = new Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(7 + Math.random() * 7)
          mesh.position.copy(pos)
          mesh.quaternion.setFromUnitVectors(_forward, v.clone().normalize())
          g.add(mesh)
          return { mesh, v }
        })
        return (t, dt) => {
          for (const p of parts) {
            p.v.multiplyScalar(1 - dt * 5)
            p.v.y -= 9 * dt
            p.mesh.position.addScaledVector(p.v, dt)
            p.mesh.scale.set(0.05, 0.05, 0.55 * (1 - t))
          }
          m.opacity = 1 - t
        }
      })

    const trail = (from, dir, length, color) =>
      add(0.4, (g) => {
        const m = basic(color)
        const mesh = new Mesh(cube, m)
        mesh.scale.set(0.5, 0.9, length)
        mesh.position.set(from.x + (dir.x * length) / 2, from.y + 0.2, from.z + (dir.z * length) / 2)
        mesh.rotation.y = Math.atan2(dir.x, dir.z)
        g.add(mesh)
        return (t) => {
          mesh.scale.x = 0.5 * (1 - t)
          m.opacity = (1 - t) * 0.7
        }
      })

    const glowSprite = (color, size, opacity) => {
      const m = new SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false })
      const sp = new Sprite(m)
      sp.scale.setScalar(size)
      return sp
    }

    /** One spinning blade: twin crescents in the weapon's colour with white-hot edges. */
    const bladeDisc = (color) => {
      const g = new Group()
      const mats = { body: basic(color), edge: basic('#ffffff'), halo: basic(color) }
      for (const k of [0, 1]) {
        const arm = new Group()
        arm.rotation.z = k * Math.PI
        const halo = new Mesh(crescent, mats.halo)
        halo.scale.setScalar(1.25)
        arm.add(halo, new Mesh(crescent, mats.body), new Mesh(crescentEdge, mats.edge))
        g.add(arm)
      }
      return { g, mats }
    }

    /**
     * The Q skill's shot: a spinning disc of twin energy blades launched forward,
     * tilted so you see its face, with a white-hot core, afterimages peeling off
     * behind it, sparks spiralling round it and scorch rings along the ground.
     * It bursts in a flash, a pillar of light and a shower of shards.
     */
    const skillShot = (origin, dir, color) => {
      const range = 16
      const flight = 0.6
      const from = origin.clone()
      from.y += 0.4
      const to = from.clone().addScaledVector(dir, range)
      const yaw = Math.atan2(dir.x, dir.z)
      add(flight, (g) => {
        const tilt = new Group()
        // Lay the disc nearly flat, tipped up toward the camera so its face shows.
        tilt.rotation.set(-Math.PI / 2 + 0.45, 0, 0)
        g.rotation.y = yaw
        g.add(tilt)
        const disc = bladeDisc(color)
        tilt.add(disc.g)
        const coreM = basic('#ffffff')
        const core = new Mesh(orb, coreM)
        core.scale.setScalar(0.5)
        const glow = glowSprite(color, 6, 0.9)
        const hot = glowSprite('#ffffff', 2.6, 0.9)
        g.add(glow, hot, core)
        let spin = 0
        let lastGhost = 0
        let lastRing = 0
        let lastSpark = 0
        return (t, dt) => {
          // Pops out of the blade fast, then spins down the line.
          const grow = Math.min(1, t / 0.12)
          const k = 0.35 + grow * 0.85 + Math.sin(t * 40) * 0.04
          g.position.lerpVectors(from, to, 1 - Math.pow(1 - t, 1.35))
          g.position.y += Math.sin(t * Math.PI) * 0.5
          spin += dt * 34
          disc.g.rotation.z = -spin
          disc.g.scale.setScalar(k)
          disc.mats.body.opacity = 0.95
          disc.mats.edge.opacity = 0.95
          disc.mats.halo.opacity = 0.35 + Math.sin(t * 50) * 0.1
          glow.material.opacity = 0.7 + Math.sin(t * 30) * 0.15
          core.scale.setScalar(0.45 + Math.sin(t * 60) * 0.08)

          // Afterimages: frozen copies of the disc that fade where they were left.
          if (t - lastGhost > 0.045) {
            lastGhost = t
            const at = g.position.clone()
            const angle = disc.g.rotation.z
            add(0.26, (gg) => {
              const ghost = bladeDisc(color)
              const tg = new Group()
              tg.rotation.set(-Math.PI / 2 + 0.45, 0, 0)
              gg.rotation.y = yaw
              gg.position.copy(at)
              ghost.g.rotation.z = angle
              ghost.g.scale.setScalar(k)
              tg.add(ghost.g)
              gg.add(tg)
              return (u) => {
                ghost.mats.body.opacity = (1 - u) * 0.35
                ghost.mats.edge.opacity = (1 - u) * 0.4
                ghost.mats.halo.opacity = (1 - u) * 0.12
                ghost.g.scale.setScalar(k * (1 + u * 0.25))
              }
            })
          }
          // Sparks flung off the spinning rim.
          if (t - lastSpark > 0.03) {
            lastSpark = t
            const a = spin * 1.3
            const rim = g.position.clone().add(new Vector3(Math.cos(a + yaw) * 1.8 * k, Math.sin(a) * 0.6, Math.sin(a + yaw) * 1.8 * k))
            burst(rim, t * 20 % 2 < 1 ? '#ffffff' : color, { count: 2, speed: 3, size: 0.12, life: 0.35, gravity: 3, up: 0.8 })
          }
          // Scorch rings along the ground under it.
          if (t - lastRing > 0.1) {
            lastRing = t
            shock(new Vector3(g.position.x, 0.05, g.position.z), color, 2.2, 0.4)
          }
        }
      })
      trail(from, dir, range, color)
      setTimeout(() => {
        impact(to, color, true)
        impact(to.clone().setY(to.y + 0.6), '#ffffff', true)
        shock(new Vector3(to.x, 0.1, to.z), color, 8, 0.6)
        shock(new Vector3(to.x, 0.1, to.z), '#ffffff', 4.5, 0.45)
        column(new Vector3(to.x, 0, to.z), color, 0.7)
        burst(to, color, { count: 26, speed: 9, size: 0.26, life: 0.85, up: 6 })
        burst(to, '#ffffff', { count: 10, speed: 7, size: 0.16, life: 0.6, up: 5 })
        streaks(to, '#ffffff', 18)
        if (to.distanceTo(local.pos) < 30) {
          local.shakeUntil = performance.now() + 240
          local.shake = Math.max(local.shake, 0.3)
        }
      }, flight * 1000)
    }

    const projectile = (d) =>
      add(Math.max(0.12, d.t), (g) => {
        const style = SHOTS[d.kind] || { color: '#ffffff' }
        const from = new Vector3(d.x, 1.6, d.z)
        const to = new Vector3(d.tx, 1.0, d.tz)
        const dir = to.clone().sub(from)
        const m = basic(style.color, !style.arrow)
        const head = new Mesh(style.arrow ? cube : orb, m)
        if (style.arrow) {
          head.scale.set(0.08, 0.08, 1.1)
          const tip = new Mesh(cube, basic('#ffffff', false))
          tip.scale.set(1.6, 1.6, 0.15)
          tip.position.z = 0.5
          head.add(tip)
        } else {
          head.scale.setScalar(0.32)
          const halo = new Mesh(orb, basic(style.color))
          halo.scale.setScalar(1.8)
          halo.material.opacity = 0.35
          head.add(halo)
        }
        head.rotation.y = Math.atan2(dir.x, dir.z)
        g.add(head)
        let last = 0
        return (t) => {
          head.position.copy(from).addScaledVector(dir, t)
          // Arrows arc a little; orbs wobble.
          head.position.y += style.arrow ? Math.sin(t * Math.PI) * 0.6 : Math.sin(t * 20) * 0.1
          if (!style.arrow && t - last > 0.08) {
            last = t
            burst(head.position.clone(), style.color, { count: 2, speed: 0.6, size: 0.12, life: 0.35, gravity: 0, up: 0.3 })
          }
          if (t >= 1) burst(to, style.color, { count: 8, speed: 3, size: 0.14, life: 0.4, up: 2 })
        }
      })

    const posOf = (id) => {
      const room = getRoom()
      if (id === room?.sessionId) return local.pos.clone()
      const p = room?.state.players.get(id)
      return p ? new Vector3(p.x, p.y, p.z) : null
    }

    const weaponGlow = (weaponId) => {
      const w = WEAPONS[weaponId]
      return w?.glow || w?.blade || '#ffffff'
    }

    return fx.on((type, d) => {
      if (type === 'hit') {
        // Other players' fights far off aren't worth the particles.
        if (!d.mine && Math.hypot(local.pos.x - d.x, local.pos.z - d.z) > 45) return
        const y = d.kind === 'dummy' ? 2.8 : d.kind === 'ore' ? 1.4 : 2.2
        const p = new Vector3(d.x, y, d.z)
        const color = d.kind === 'ore' ? '#fff6c8' : d.crit ? '#ffcf3b' : '#ffffff'
        burst(p, color, { count: d.crit ? 14 : 8, speed: 4, up: 2.5 })
        if (d.mine) {
          const glow = d.kind === 'ore' ? '#ffe07a' : d.crit ? '#ff3b2e' : weaponGlow(useGame.getState().profile?.weaponId)
          // Pull the flash toward the player so it isn't buried inside the target.
          const toMe = local.pos.clone().sub(p).setY(0).normalize()
          const at = p.clone().addScaledVector(toMe, 0.9)
          impact(at, glow, d.crit)
          streaks(at, d.crit ? '#ffcf3b' : glow, d.crit ? 16 : 10)
          const now = performance.now()
          local.shakeUntil = Math.max(local.shakeUntil, now + (d.crit ? 170 : 100))
          local.shake = Math.max(d.crit ? 0.24 : 0.11, now < local.shakeUntil - 120 ? local.shake : 0)
          if (d.kind === 'enemy') {
            // Hit-stop and a little FOV kick sell the weight of the blow.
            local.hitStopUntil = now + (d.crit ? 95 : 60)
            local.punch = Math.max(local.punch, d.crit ? 2.4 : 1.1)
            // Blood-red chips knocked off away from you.
            burst(at.clone(), d.crit ? '#ff3b2e' : '#d8263a', { count: d.crit ? 8 : 5, speed: 4.5, size: 0.12, life: 0.5, up: 2.5 })
          }
        } else if (d.kind === 'enemy') {
          // Another player's blade landing: the flash and streaks, pulled toward
          // them, without the shake and hit-stop that belong to your own blows.
          const by = posOf(d.by)
          const at = p.clone()
          if (by) at.addScaledVector(by.clone().sub(p).setY(0).normalize(), 0.9)
          const glow = weaponGlow(getRoom()?.state.players.get(d.by)?.weapon)
          impact(at, glow, d.crit)
          streaks(at, glow, d.crit ? 12 : 7)
        }
        const cls = d.mine ? (d.crit ? 'ft-crit' : 'ft-dmg') : 'ft-other'
        floatText(p.setY(y + 0.8), `-${formatNum(d.amount)}`, cls)
        if (d.mine && d.crit) floatText(p.clone().setY(y + 1.9), 'CRITICAL!', 'ft-crit-tag', { life: 800, rise: 1.2, jitter: 0.2 })
      } else if (type === 'trained') {
        if (!(d.damage > 0) || !local.ready) return
        const p = local.pos.clone()
        p.y += 1.6
        floatText(
          p,
          [
            ['🗡️', 'ft-emoji'],
            [`+${formatNum(d.damage)}`, 'ft-train-num'],
          ],
          'ft-train',
          { life: 950, rise: 2.6, jitter: 1.6 },
        )
        burst(p.clone().setY(p.y - 0.3), '#ffd23b', { count: 4, speed: 1.2, size: 0.1, life: 0.5, gravity: -3, up: 1 })
      } else if (type === 'kill') {
        const p = new Vector3(d.x, 1.2, d.z)
        burst(p, '#e8e8e8', { count: 18, speed: 5, size: 0.35, life: 0.8, up: 4 })
        burst(p, '#ffd23b', { count: 8, speed: 6, size: 0.18, life: 0.7, up: 6 })
        shock(new Vector3(d.x, 0, d.z), '#ffffff', 4, 0.5)
      } else if (type === 'mined') {
        const color = ORES[d.type]?.color || '#ffffff'
        const p = new Vector3(d.x, 1, d.z)
        burst(p, color, { count: 16, speed: 5, size: 0.3, life: 0.8, up: 5 })
        burst(p, '#6b6f78', { count: 10, speed: 4, size: 0.35, life: 0.7, up: 3 })
      } else if (type === 'loot') {
        floatText(new Vector3(d.x, 3.2, d.z), `+1 ${ORES[d.ore].name}`, 'ft-loot')
      } else if (type === 'swing') {
        const p = new Vector3(d.x + Math.sin(d.ry) * 1.1, d.y + 0.3, d.z + Math.cos(d.ry) * 1.1)
        const color = weaponGlow(d.weaponId)
        burst(p.clone(), color, { count: 6, speed: 4, size: 0.1, life: 0.35, gravity: 4, up: 1.5 })
        // One look per combo move: chop, sweep, uppercut, thrust, then a spin.
        if (d.combo === 4) {
          const c = new Vector3(d.x, d.y, d.z)
          for (let i = 0; i < 4; i += 1) slash(c, d.ry + (i / 4) * Math.PI * 2, color, true, 0)
          shock(new Vector3(d.x, d.y - 0.85, d.z), color, 4.5, 0.4)
        } else if (d.combo === 1) slash(p, d.ry, color, false, 0)
        else if (d.combo === 2) slash(p.setY(p.y + 0.4), d.ry, color, false, -1.2)
        else if (d.combo === 3) {
          trail(new Vector3(d.x, d.y + 0.3, d.z), new Vector3(Math.sin(d.ry), 0, Math.cos(d.ry)), 4.5, color)
          slash(p.addScaledVector(new Vector3(Math.sin(d.ry), 0, Math.cos(d.ry)), 1.2), d.ry, color, true, 0.2)
        } else slash(p, d.ry, color, false, 1.2)
      } else if (type === 'levelup') {
        const p = posOf(d.id)
        if (!p) return
        p.y -= 0.9
        column(p, d.big ? '#ff7ae0' : '#ffd23b')
        shock(p, d.big ? '#ff7ae0' : '#ffd23b', 7, 0.8)
        burst(p.clone().setY(p.y + 1), '#fff3a0', { count: 20, speed: 5, size: 0.14, life: 1, up: 7, gravity: 6 })
      } else if (type === 'skill') {
        const origin = d.local ? local.pos.clone() : posOf(d.by) || new Vector3(d.x, 1, d.z)
        const color = weaponGlow(d.weaponId || getRoom()?.state.players.get(d.by)?.weapon)
        const ground = origin.clone()
        ground.y -= 0.9
        if (d.key === 'dash') {
          trail(origin, new Vector3(d.dirX, 0, d.dirZ), 9, color)
          slash(origin.clone().add(new Vector3(d.dirX * 5, 0, d.dirZ * 5)), Math.atan2(d.dirX, d.dirZ), color, true)
        } else if (d.key === 'whirlwind') {
          shock(ground, color, 7, 0.5)
          for (let i = 0; i < 4; i += 1) slash(origin, (i / 4) * Math.PI * 2, color, true)
        } else if (d.key === 'earthsplitter') {
          // The local slam is timed to landing; remote casts just play it now.
          if (!d.local) shock(ground, '#c98a4a', 8, 0.7)
        } else if (d.key === 'flurry') {
          for (let i = 0; i < 3; i += 1) {
            const ry = Math.atan2(d.dirX, d.dirZ) + (i - 1) * 0.5
            slash(origin.clone().add(new Vector3(d.dirX * 1.4, 0, d.dirZ * 1.4)), ry, color)
          }
        }
        // Every skill also fires its special shot straight ahead.
        const dir = new Vector3(d.dirX ?? 0, 0, d.dirZ ?? 1)
        if (dir.lengthSq() > 0) skillShot(origin, dir.normalize(), color)
      } else if (type === 'leapStart') {
        // Dust kicked up by the take-off.
        const p = new Vector3(d.x, Math.max(0, d.y - 0.85), d.z)
        shock(p, '#e8dcc0', 3, 0.35)
        burst(p.clone().setY(p.y + 0.2), '#b8a07a', { count: 12, speed: 4, size: 0.22, life: 0.5, up: 2 })
      } else if (type === 'slam') {
        const p = new Vector3(d.x, Math.max(0, d.y - 0.9), d.z)
        shock(p, '#ffd23b', 8, 0.7)
        shock(p, '#c98a4a', 5, 0.5)
        burst(p.clone().setY(p.y + 0.3), '#a0784a', { count: 22, speed: 7, size: 0.3, life: 0.8, up: 5 })
      } else if (type === 'shot') {
        projectile(d)
      } else if (type === 'sparkle') {
        burst(new Vector3(d.x, d.y, d.z), d.color, { count: 2, speed: 0.8, size: 0.13, life: 0.45, gravity: -1, up: 0.2 })
        burst(new Vector3(d.x, d.y, d.z), '#ffffff', { count: 1, speed: 0.5, size: 0.08, life: 0.35, gravity: 0, up: 0.3 })
      } else if (type === 'bagIn') {
        const p = new Vector3(d.x, d.y, d.z)
        burst(p, d.color, { count: 14, speed: 3, size: 0.12, life: 0.5, gravity: 2, up: 2.5 })
        burst(p, '#fff6c0', { count: 8, speed: 2, size: 0.09, life: 0.45, gravity: 0, up: 1.5 })
        shock(new Vector3(local.pos.x, local.pos.y - 0.85, local.pos.z), d.color, 2.2, 0.4)
      } else if (type === 'stageClear') {
        const stage = stageById(d.stage)
        if (!stage) return
        const accent = DUNGEON_THEMES[stage.theme]?.accent || '#ffd23b'
        // The gate bursts open, and every caged ore unlocks.
        const gate = new Vector3(0, 4.5, gateZ(d.stage) + 1)
        burst(gate, '#ffd23b', { count: 26, speed: 8, size: 0.3, life: 1, up: 6 })
        burst(gate, accent, { count: 20, speed: 6, size: 0.22, life: 0.9, up: 5 })
        shock(new Vector3(0, 0.2, gateZ(d.stage) + 2), accent, 10, 0.9)
        for (const o of getRoom()?.state.ores.values() || []) {
          if (o.stage !== d.stage || o.event || o.owner !== getRoom().sessionId) continue
          burst(new Vector3(o.x, 1.2, o.z), '#c9ced6', { count: 10, speed: 4, size: 0.18, life: 0.7, up: 4 })
          burst(new Vector3(o.x, 1.2, o.z), ORES[o.type]?.color || '#ffffff', { count: 8, speed: 3, size: 0.16, life: 0.8, up: 5 })
        }
      } else if (type === 'hurtLocal') {
        const p = local.pos.clone()
        p.y += 1.3
        floatText(p, `-${formatNum(d.amount)}`, 'ft-hurt')
        burst(p.clone().setY(p.y - 0.4), '#ff4d3d', { count: 8, speed: 3, size: 0.13, life: 0.45, up: 2 })
      }
    })
  }, [getThree])

  useFrame((_, dt) => {
    const list = live.current
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const e = list[i]
      e.age += dt
      const t = Math.min(1, e.age / e.life)
      e.update(t, dt)
      if (t >= 1) {
        root.current?.remove(e.g)
        e.g.traverse((o) => {
          if (o.material && !o.material.userData.shared) o.material.dispose()
        })
        list.splice(i, 1)
      }
    }
  })

  return <group ref={root} />
}

export default Effects
