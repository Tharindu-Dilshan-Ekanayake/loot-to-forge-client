import { Component } from 'react'

/**
 * Shows `fallback` instead of an avatar that failed to load (a Bloxity CDN
 * outage, a bad part id), so one broken download can't take the scene down.
 */
export class AvatarBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

export default AvatarBoundary
