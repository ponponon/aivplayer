import { ListVideo } from 'lucide-react'
import { useAppContext } from './app-context'

export function PlaylistPanel(): React.ReactElement {
  const app = useAppContext()
  const { state, copy } = app
  return <><div className="panel-header"><div><span className="panel-kicker">{copy.panels.playlistKicker}</span><h2>{copy.panels.playlistTitle}</h2></div><ListVideo size={19} /></div><div className={`playlist ${state.playlist.length === 0 ? 'is-empty' : ''}`}>{state.playlist.length === 0 ? <div className="panel-empty">{copy.panels.noMedia}</div> : state.playlist.map((file, index) => <button className={`playlist-item ${state.currentFile?.path === file.path ? 'active' : ''}`} key={file.id} type="button" onClick={() => app.selectFile(file)}><span className="playlist-index">{String(index + 1).padStart(2, '0')}</span><span className="playlist-name">{file.name}</span><span className="playlist-ext">{file.extension}</span></button>)}</div></>
}
