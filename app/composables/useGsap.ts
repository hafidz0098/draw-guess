import gsap from 'gsap'

export function useGsap() {
  function fadeIn(el: Element | string, vars?: gsap.TweenVars) {
    return gsap.fromTo(el, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out', ...vars })
  }

  function popIn(el: Element | string, vars?: gsap.TweenVars) {
    return gsap.fromTo(
      el,
      { opacity: 0, scale: 0.85 },
      { opacity: 1, scale: 1, duration: 0.35, ease: 'back.out(1.6)', ...vars },
    )
  }

  function slideIn(el: Element | string, from: 'left' | 'right' | 'up' | 'down' = 'up', vars?: gsap.TweenVars) {
    const map = {
      left: { x: -24, y: 0 },
      right: { x: 24, y: 0 },
      up: { x: 0, y: 16 },
      down: { x: 0, y: -16 },
    }
    return gsap.fromTo(el, { opacity: 0, ...map[from] }, { opacity: 1, x: 0, y: 0, duration: 0.35, ease: 'power2.out', ...vars })
  }

  function staggerChildren(parent: Element | string, childSel = ':scope > *', vars?: gsap.TweenVars) {
    const parentEl = typeof parent === 'string' ? document.querySelector(parent) : parent
    if (!parentEl) return
    const targets = parentEl.querySelectorAll(childSel)
    if (!targets.length) return
    return gsap.from(targets, {
      opacity: 0,
      y: 16,
      duration: 0.3,
      stagger: 0.06,
      ease: 'power2.out',
      ...vars,
    })
  }

  function pulse(el: Element | string) {
    return gsap.fromTo(el, { scale: 1 }, { scale: 1.08, duration: 0.15, yoyo: true, repeat: 1, ease: 'power1.inOut' })
  }

  function confettiBurst(container: Element) {
    const colors = ['#F97316', '#3B82F6', '#22C55E', '#EAB308', '#EC4899']
    const pieces: HTMLElement[] = []
    for (let i = 0; i < 24; i++) {
      const p = document.createElement('div')
      p.style.cssText = `
        position:absolute;width:8px;height:8px;border-radius:2px;
        background:${colors[i % colors.length]};pointer-events:none;z-index:50;
        left:50%;top:40%;
      `
      container.appendChild(p)
      pieces.push(p)
      gsap.to(p, {
        x: (Math.random() - 0.5) * 300,
        y: Math.random() * -200 - 50,
        rotation: Math.random() * 360,
        opacity: 0,
        duration: 0.9 + Math.random() * 0.4,
        ease: 'power2.out',
        onComplete: () => p.remove(),
      })
    }
    return pieces
  }

  return { gsap, fadeIn, popIn, slideIn, staggerChildren, pulse, confettiBurst }
}
