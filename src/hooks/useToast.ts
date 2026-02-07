import { toast } from 'sonner'

export function useToast() {
  const showSuccess = (message: string) => {
    toast.success(message)
  }
  
  const showError = (message: string, error?: Error) => {
    toast.error(message, {
      description: error?.message,
      action: {
        label: 'Retry',
        onClick: () => window.location.reload(),
      },
    })
  }
  
  const showLoading = (message: string) => {
    return toast.loading(message)
  }
  
  const showInfo = (message: string) => {
    toast.info(message)
  }

  const showWarning = (message: string) => {
    toast.warning(message)
  }

  const dismiss = toast.dismiss

  const promise = <T,>(
    promise: Promise<T>,
    {
      loading,
      success,
      error,
    }: {
      loading: string
      success: string
      error: string
    }
  ) => {
    return toast.promise(promise, {
      loading,
      success,
      error,
    })
  }
  
  return {
    showSuccess,
    showError,
    showLoading,
    showInfo,
    showWarning,
    dismiss,
    promise,
  }
}
