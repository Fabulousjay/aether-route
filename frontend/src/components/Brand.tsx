import { Orbit } from 'lucide-react'
import { Link } from 'react-router-dom'

export function Brand() {
  return <Link to="/" className="brand"><span className="brand-mark"><Orbit size={23} strokeWidth={1.8} /></span><span>AETHER<span className="brand-divider">/</span>ROUTE</span></Link>
}
