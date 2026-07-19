export class NewOrderAlert {
  private context: AudioContext | null = null
  private armed = false

  async arm() {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return false
    if (!this.context) this.context = new AudioContextClass()
    if (this.context.state === 'suspended') await this.context.resume()
    this.armed = this.context.state === 'running'
    return this.armed
  }

  isArmed() {
    return this.armed
  }

  play() {
    const context = this.context
    if (!context || !this.armed || context.state !== 'running') return false
    const start = context.currentTime + 0.015
    this.tone(context, 880, start, 0.13, 0.08)
    this.tone(context, 1175, start + 0.18, 0.16, 0.1)
    return true
  }

  private tone(context: AudioContext, frequency: number, start: number, duration: number, gainValue: number) {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(frequency, start)
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.018)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start(start)
    oscillator.stop(start + duration + 0.02)
  }

  dispose() {
    this.armed = false
    if (this.context) void this.context.close()
    this.context = null
  }
}
