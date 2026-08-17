declare module 'lz4js' {
  const lz4: {
    decompress(data: Uint8Array): Uint8Array | number[]
  }
  export default lz4
}
