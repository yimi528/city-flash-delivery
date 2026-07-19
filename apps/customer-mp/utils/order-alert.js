const FILE_NAME = 'new-order-alert.wav'

function buildAlertWave() {
  const sampleRate = 8000
  const duration = 0.36
  const sampleCount = Math.floor(sampleRate * duration)
  const buffer = new ArrayBuffer(44 + sampleCount)
  const view = new DataView(buffer)
  const writeText = (offset, value) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index))
  }
  writeText(0, 'RIFF')
  view.setUint32(4, 36 + sampleCount, true)
  writeText(8, 'WAVEfmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate, true)
  view.setUint16(32, 1, true)
  view.setUint16(34, 8, true)
  writeText(36, 'data')
  view.setUint32(40, sampleCount, true)
  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / sampleRate
    const secondTone = time >= 0.19
    const frequency = time < 0.14 ? 880 : secondTone ? 1175 : 0
    const localTime = secondTone ? time - 0.19 : time
    const toneLength = secondTone ? 0.17 : 0.14
    const envelope = frequency ? Math.sin(Math.PI * Math.min(localTime / toneLength, 1)) * 0.32 : 0
    view.setUint8(44 + index, Math.round(128 + 127 * envelope * Math.sin(2 * Math.PI * frequency * time)))
  }
  return buffer
}

function ensureAlertFile() {
  const path = `${wx.env.USER_DATA_PATH}/${FILE_NAME}`
  const fileSystem = wx.getFileSystemManager()
  try {
    fileSystem.accessSync(path)
  } catch (error) {
    fileSystem.writeFileSync(path, buildAlertWave())
  }
  return path
}

function createOrderAlert() {
  let audio = null
  return {
    play() {
      try {
        if (!audio) {
          if (wx.setInnerAudioOption) wx.setInnerAudioOption({ mixWithOther: true, obeyMuteSwitch: true })
          audio = wx.createInnerAudioContext()
          audio.autoplay = false
          audio.loop = false
          audio.volume = 0.78
          audio.src = ensureAlertFile()
        }
        audio.stop()
        audio.seek(0)
        audio.play()
        return true
      } catch (error) {
        return false
      }
    },
    destroy() {
      if (audio) audio.destroy()
      audio = null
    }
  }
}

module.exports = { createOrderAlert }
