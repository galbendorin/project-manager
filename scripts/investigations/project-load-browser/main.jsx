import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ProjectSelector from '../../../src/components/ProjectSelector.jsx';
import { control } from './environment.jsx';
import '../../../src/styles/index.css';
function Fixture() {
  const [generation, setGeneration] = useState(0), [result, setResult] = useState('');
  return <><div className="flex flex-wrap gap-3 p-4">
    <label>Synthetic response <select defaultValue="fail" onChange={event => { control.mode = event.target.value; }}>
      <option value="fail">Failure</option><option value="projects">Projects</option><option value="empty">Empty</option><option value="null">Missing result</option><option value="throw">Thrown failure</option>
    </select></label>
    <button onClick={() => setGeneration(value => value + 1)}>Reopen synthetic home</button>
    <button onClick={() => setResult(`${control.requests} requests`)}>Show request count</button><p role="status">{result}</p>
    <p>Actual project home with synthetic auth, plan and network. No production requests.</p>
  </div><ProjectSelector key={generation} onSelectProject={project => setResult(`Opened ${project.name}`)}/></>;
}
createRoot(document.getElementById('root')).render(<React.StrictMode><Fixture/></React.StrictMode>);
