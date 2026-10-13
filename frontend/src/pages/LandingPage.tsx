import { ArrowRight, ArrowUpRight, CloudSun, Compass, ShieldCheck } from 'lucide-react'
import { motion } from 'motion/react'
import { Link } from 'react-router-dom'
import { Globe } from '../components/Globe'
import { Navigation } from '../components/Navigation'

const features = [
  { icon: Compass, number: '01', title: 'Plan with perspective', description: 'Explore alternative journeys before the first mile.' },
  { icon: CloudSun, number: '02', title: 'Read the road ahead', description: 'See how changing weather could affect the trip.' },
  { icon: ShieldCheck, number: '03', title: 'Understand the trade-offs', description: 'Compare exposure, travel time and load conditions.' },
]

export function LandingPage() {
  return <div className="site-shell"><Navigation /><main><section className="hero"><div className="hero-copy"><motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .6 }}><span className="eyebrow"><span className="live-dot" /> WEATHER-AWARE FREIGHT INTELLIGENCE</span><h1>The road ahead,<br /><em>in clearer view.</em></h1><p>Routes change. Conditions shift. Make the next decision with a better understanding of what lies between departure and arrival.</p><div className="hero-actions"><Link to="/studio" className="button-primary">Explore route studio <ArrowUpRight size={18} /></Link><a href="#approach" className="button-quiet">Discover the approach <ArrowRight size={17} /></a></div></motion.div><div className="hero-footnote"><span>BUILT FOR THE JOURNEY</span><span>01 — 03</span></div></div><Globe /></section><section id="approach" className="approach"><div className="section-heading"><span className="eyebrow">THE APPROACH</span><h2>More than a line<br />on a map.</h2><p>A considered view of every journey, from the route itself to the conditions that surround it.</p></div><div className="feature-grid">{features.map(({ icon: Icon, number, title, description }) => <article className="feature-card" key={number}><div className="feature-top"><Icon size={25} strokeWidth={1.5} /><span>{number}</span></div><h3>{title}</h3><p>{description}</p><ArrowUpRight size={18} className="feature-arrow" /></article>)}</div></section></main><footer className="footer"><span>AETHER / ROUTE</span><span>Made for informed journeys.</span></footer></div>
}
