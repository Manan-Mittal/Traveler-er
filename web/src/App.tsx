import MapView from './MapView'

export default function App() {
  return (
    <div className="relative h-full w-full overflow-hidden">
      <MapView />
      <div className="glass absolute left-4 top-4 px-4 py-3 text-[15px] font-semibold tracking-tight">
        Traveler-er
      </div>
    </div>
  )
}
