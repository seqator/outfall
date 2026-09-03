/**
 * Компоненты ECS — простые сериализуемые объекты (§3.2), без методов и
 * классов. Расширяют `Components` из `core/world.ts` через declaration
 * merging: каждая игровая система добавляет сюда свой кусочек интерфейса.
 *
 * OF-010 заводит только минимальный набор для примера системы движения:
 * позиция + скорость + маркер «управляется вводом». Бой/ИИ/инвентарь и
 * остальные компоненты добавляются вместе со своими системами (OF-015/016
 * и далее) — этот файл не трогают, а расширяют тем же способом ниже.
 */

/** Мировые (тайловые) координаты; `prevX/prevY` — снимок на начало тика, для интерполяции в рендере. */
export interface TransformComponent {
  x: number;
  y: number;
  z: number;
  prevX: number;
  prevY: number;
}

/** Мировая скорость в тайлах/сек; выставляется системами ввода/ИИ, читается системой движения. */
export interface VelocityComponent {
  vx: number;
  vy: number;
}

/** Маркер: скорость сущности выставляется напрямую из `InputSnapshot` (игрок), а не ИИ. */
export interface ControlledComponent {
  speed: number;
}

declare module '../../core/world' {
  interface Components {
    transform: TransformComponent;
    velocity: VelocityComponent;
    controlled: ControlledComponent;
  }
}
