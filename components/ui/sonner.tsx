"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheck, Info, TriangleAlert, CircleX, Loader } from "lucide-react"
import { useTheme } from "@/lib/theme"

const Toaster = (props: ToasterProps) => {
  const { theme } = useTheme()

  return (
    <Sonner
      theme={theme}
      position="bottom-right"
      gap={8}
      offset={20}
      mobileOffset={{ bottom: 88, left: 12, right: 12 }}
      icons={{
        success: <CircleCheck className="size-4 text-success" />,
        info: <Info className="size-4 text-info" />,
        warning: <TriangleAlert className="size-4 text-warning" />,
        error: <CircleX className="size-4 text-danger" />,
        loading: <Loader className="size-4 animate-spin" />,
      }}
      toastOptions={{
        duration: 3200,
        classNames: {
          toast: "!rounded-[12px] !border !border-border !bg-popover !text-popover-foreground !shadow-float !px-4 !py-3 !gap-2.5 !font-sans",
          title: "!text-[13px] !font-medium",
          description: "!text-[12.5px] !text-muted-foreground",
          actionButton: "!bg-primary !text-primary-foreground !rounded-[7px] !text-[12px] !font-medium",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
