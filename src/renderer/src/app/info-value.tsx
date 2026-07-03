import type { ReactElement } from 'react'

type InfoValueProps = {
  value: string
  tooltip?: string
}

export function InfoValue(props: InfoValueProps): ReactElement {
  const { value, tooltip = value } = props

  return (
    <div className="info-value" data-tooltip={tooltip} aria-label={tooltip} tabIndex={0}>
      <strong>{value}</strong>
    </div>
  )
}
