import { ArrowUpRight } from 'lucide-react'
import { Link, NavLink } from 'react-router-dom'
import { Brand } from './Brand'

export function Navigation() {
  return <header className="navigation"><Brand /><nav aria-label="Main navigation"><NavLink to="/">Overview</NavLink><NavLink to="/studio">Route studio</NavLink></nav><Link className="nav-cta" to="/studio">Open studio <ArrowUpRight size={16} /></Link></header>
}
