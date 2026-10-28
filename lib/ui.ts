/** 抽屉/弹窗在窄屏下不应超出视口。 */
export function responsiveDrawerWidth(max: number): string {
  return `min(${max}px, calc(100vw - 24px))`
}

export function responsiveModalWidth(max: number): string {
  return `min(${max}px, calc(100vw - 32px))`
}
