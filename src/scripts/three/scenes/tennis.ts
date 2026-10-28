import { BoxGeometry, Group, IcosahedronGeometry, Mesh, MeshStandardMaterial } from 'three';
import { mountMicro } from '../micro';
import { phase } from '../phases';
import type { SceneContext, SceneInstance } from '../types';

/*
 * Micro-scena Tennis (spec §13): la pallina segna la riga, solleva la terra rossa e arriva verso
 * lo schermo. Tre fasi: discesa, rimbalzo con frammenti di terra, volo verso chi guarda. I frammenti
 * hanno direzioni fisse (generatore seminato): lo stato dipende solo dall'avanzamento.
 */

const FRAGMENTS = 14;
const BOUNCE = 0.42;
const GRAVITY = 5;

/** Generatore deterministico (mulberry32): stessa sequenza a ogni montaggio. */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function mount(context: SceneContext): SceneInstance {
  return mountMicro(context, ({ scene, camera, own, tint }) => {
    const clay = tint(['--sec-sport-alt', '--ctp-peach']);
    const court = new Mesh(
      own(new BoxGeometry(6, 0.1, 12)),
      own(new MeshStandardMaterial({ color: clay, flatShading: true, roughness: 1 })),
    );
    court.position.y = -0.05;
    scene.add(court);

    const line = new Mesh(
      own(new BoxGeometry(6, 0.02, 0.14)),
      own(new MeshStandardMaterial({ color: tint(['--text']) })),
    );
    line.position.y = 0.005;
    scene.add(line);

    const ballMaterial = own(
      new MeshStandardMaterial({
        color: tint(['--sec-sport', '--text']),
        emissive: tint(['--sec-sport', '--text']),
        emissiveIntensity: 0.3,
        flatShading: true,
      }),
    );
    const ball = new Mesh(own(new IcosahedronGeometry(0.2, 1)), ballMaterial);
    scene.add(ball);

    // Frammenti di terra: stesso materiale della superficie ma piu scuro, direzioni seminate.
    const dust = new Group();
    scene.add(dust);
    const rand = seeded(62);
    const fragmentMaterial = own(
      new MeshStandardMaterial({
        color: tint(['--ctp-maroon', '--sec-sport-alt']),
        flatShading: true,
      }),
    );
    const fragmentGeometry = own(new IcosahedronGeometry(0.1, 0));
    const fragments = Array.from({ length: FRAGMENTS }, () => {
      const mesh = new Mesh(fragmentGeometry, fragmentMaterial);
      dust.add(mesh);
      const angle = rand() * Math.PI * 2;
      const speed = 0.6 + rand() * 1.2;
      return {
        mesh,
        vx: Math.cos(angle) * speed,
        vz: Math.sin(angle) * speed * 0.7,
        vy: 1.4 + rand() * 1.6,
        scale: 0.6 + rand() * 0.9,
      };
    });

    return {
      update(progress) {
        // Discesa verso la riga, poi risalita verso lo schermo.
        const down = phase(progress, 0, BOUNCE);
        const up = phase(progress, BOUNCE, 1);
        if (progress < BOUNCE) {
          ball.position.set(-0.8 * (1 - down), 0.2 + 3.6 * (1 - down * down), -5 * (1 - down));
        } else {
          ball.position.set(0.9 * up, 0.2 + 0.7 * up + 1.6 * Math.sin(up * Math.PI), 4.6 * up);
        }
        ball.rotation.set(progress * 9, progress * 6, 0);

        // Frammenti: partono dal punto del rimbalzo e ricadono sulla terra.
        const t = Math.max(0, (progress - BOUNCE) / 0.5) * 0.9;
        for (const f of fragments) {
          const y = Math.max(0, f.vy * t - 0.5 * GRAVITY * t * t);
          f.mesh.visible = progress > BOUNCE;
          f.mesh.position.set(f.vx * t, y + 0.05, f.vz * t);
          f.mesh.scale.setScalar(f.scale);
        }
      },
      fit(aspect) {
        const vertical = (camera.fov * Math.PI) / 360;
        const horizontal = Math.atan(Math.tan(vertical) * aspect);
        const distance = Math.max(2.4 / Math.tan(vertical), 2.2 / Math.tan(horizontal));
        camera.position.set(0, 1.5 + distance * 0.25, distance + 3);
        camera.lookAt(0, 1.0, 0);
      },
    };
  });
}
