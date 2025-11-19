export enum GameStatus {
  MENU = 'MENU',
  PLAYING = 'PLAYING',
  WON = 'WON',
  DEAD = 'DEAD'
}

export interface Point {
  x: number;
  y: number;
  oldx: number;
  oldy: number;
  mass: number;
  radius: number;
  isWheel: boolean;
  pinned: boolean;
  rotation: number;
}

export interface Stick {
  p1: Point;
  p2: Point;
  length: number;
  stiffness: number;
  visible: boolean;
  width: number;
  color?: string;
}

export interface Entity {
  x: number;
  y: number;
  r?: number; // radius for collision
  collected?: boolean;
}

export interface Bike {
  rw: Point;
  fw: Point;
  body: Point;
  head: Point;
  handle: Point;
}

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  space: boolean;
  enter: boolean;
}