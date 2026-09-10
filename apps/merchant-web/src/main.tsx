import React from 'react'
import ReactDOM from 'react-dom/client'
import { OperationsApp } from './features/operations/OperationsApp'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <OperationsApp />
  </React.StrictMode>
)
