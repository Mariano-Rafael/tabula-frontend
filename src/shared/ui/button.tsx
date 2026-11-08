import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../lib/utils'

const buttonVariants = cva('inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-50', {
  variants: {
    variant: {
      default: 'bg-emerald-800 text-white hover:bg-emerald-900',
      outline: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
    },
  },
  defaultVariants: { variant: 'default' },
})

export function Button({ className, variant, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant }), className)} {...props} />
}
