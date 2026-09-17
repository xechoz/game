export type Point = {
  x: number
  y: number
}

export type BoardLayout = {
  trackPoints: Point[]
  outerBorderPoints: Point[]
  topBorderPoints: Point[]
  rightBorderPoints: Point[]
  bottomBorderPoints: Point[]
  leftBorderPoints: Point[]
  homeEntryPoints: Point[]
  baseSlots: Point[][]
  finishSlots: Point[][]
}

export type LandingPoint = Point & {
  color: string
}

export type RefreshGameView = (options?: { deferResultPage?: boolean }) => void

export type VoidCallback = () => void
