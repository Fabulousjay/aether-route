import { motion } from 'motion/react'

export function Globe() {
  return <div className="globe-scene" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><motion.div className="globe" animate={{ rotate: 360 }} transition={{ duration: 80, repeat: Infinity, ease: 'linear' }}><div className="globe-grid" /><div className="globe-shade" /></motion.div><svg className="flight-path" viewBox="0 0 520 520" fill="none"><path d="M110 306 Q246 98 416 205" stroke="#B8EF64" strokeWidth="2" strokeDasharray="5 9" /><circle cx="110" cy="306" r="6" fill="#B8EF64" /><circle cx="416" cy="205" r="6" fill="#B8EF64" /></svg><span className="globe-label globe-label-left">01 / DEPARTURE</span><span className="globe-label globe-label-right">02 / ARRIVAL</span></div>
}
