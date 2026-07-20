import { useEffect } from 'react'
import { MidiEngine } from '../../midi/midiEngine'
import { usePerformanceDeckSession } from '../../state/performanceDeckSessionStore'
import { applyMidiEventToBindings } from '../../state/performanceDeckActions'

/** Applies MIDI bindings to the live graph regardless of whether the
 *  Performance Deck panel is open — mount this unconditionally (see
 *  App.tsx) so a bound panic footswitch or fader keeps working with the
 *  deck closed, mirroring how the MidiInput node itself evaluates
 *  regardless of any panel being open. Renders nothing. */
export default function PerformanceDeckMidiBridge() {
  useEffect(() => {
    return MidiEngine.instance.subscribeRaw((event) => {
      // While MIDI-learn capture is armed, the deck panel itself consumes
      // the next event to create the binding — don't also apply it here.
      if (usePerformanceDeckSession.getState().midiLearnTarget !== null) return
      applyMidiEventToBindings(event)
    })
  }, [])
  return null
}
