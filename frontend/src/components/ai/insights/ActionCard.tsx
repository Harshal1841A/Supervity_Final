'use client'

import { cn } from '@/lib/utils'
import { Icons } from '@/components/ui/icons'
import { Button } from '@/components/ui/button'

export interface ActionItem {
  title: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  estimated_impact: string
  action_type?: string
  action_config?: Record<string, unknown>
}

interface ActionCardProps {
  action: ActionItem
  onApply?: (action: ActionItem) => void
}

const priorityConfig = {
  critical: {
    color: 'text-red-400',
    bg: 'bg-red-500/20',
    badge: 'bg-red-500/25 text-red-300',
  },
  high: {
    color: 'text-red-400',
    bg: 'bg-red-500/15',
    badge: 'bg-red-500/20 text-red-300',
  },
  medium: {
    color: 'text-amber-400',
    bg: 'bg-amber-500/15',
    badge: 'bg-amber-500/20 text-amber-300',
  },
  low: {
    color: 'text-brand-cornflower',
    bg: 'bg-brand-cornflower/15',
    badge: 'bg-brand-cornflower/20 text-sky-200',
  },
}

export function ActionCard({ action, onApply }: ActionCardProps) {
  const priority = priorityConfig[action.priority]

  return (
    <div className={cn(
      'flex items-center gap-4 rounded-xl p-4',
      'bg-card/70 border border-border/50',
      'transition-all duration-200 hover:bg-card hover:shadow-soft'
    )}>
      {/* Icon */}
      <div className={cn(
        'flex h-10 w-10 items-center justify-center rounded-lg',
        priority.bg
      )}>
        <Icons.zap className={cn('h-5 w-5', priority.color)} strokeWidth={1.5} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h4 className="font-medium text-foreground truncate">{action.title}</h4>
          <span className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase flex-shrink-0',
            priority.badge
          )}>
            {action.priority}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
          <Icons.trendingUp className="h-3 w-3" strokeWidth={1.5} />
          {action.estimated_impact}
        </p>
      </div>

      {/* Apply Button */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => onApply?.(action)}
        className="flex-shrink-0"
      >
        Apply
        <Icons.arrowRight className="ml-1 h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

