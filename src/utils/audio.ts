
let sharedAudioContext: AudioContext | null = null;

export const playNotificationTone = () => {
  try {
    // Reuse or create the audio context
    if (!sharedAudioContext) {
      sharedAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    // Handle suspended state (common in browsers if no interaction yet or long idle)
    if (sharedAudioContext.state === 'suspended') {
      sharedAudioContext.resume();
    }
    
    const audioContext = sharedAudioContext;
    
    // Use a simple, pleasant chime sound: Two notes (C6 then E6)
    const playNote = (frequency: number, startTime: number, duration: number) => {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, startTime);
      
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(0.1, startTime + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.start(startTime);
      oscillator.stop(startTime + duration);
    };

    const now = audioContext.currentTime;
    playNote(1046.50, now, 0.3); // C6
    playNote(1318.51, now + 0.1, 0.4); // E6
    
  } catch (err) {
    // Gracefully handle browser autoplay restrictions
    console.warn('Notification audio blocked or unsupported:', err);
  }
};
