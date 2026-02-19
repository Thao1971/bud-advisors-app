import React from 'react'
import ReactDOM from 'react-dom/client'
// Hemos cambiado './App.jsx' por '../App.jsx' para que suba un nivel y lo encuentre en la raíz
import App from '../App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)