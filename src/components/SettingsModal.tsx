"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Reusable Settings Modal Component
 * 
 * Styled like Slack's settings dialog with dark theme
 * No sidebar or breadcrumb - just the content area
 */
export function SettingsModal({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: SettingsModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "overflow-hidden p-0 md:max-h-[500px] md:max-w-[700px] lg:max-w-[800px]",
          className
        )}
        showCloseButton={true}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">
          {description || title}
        </DialogDescription>
        <div className="flex h-[480px] flex-1 flex-col overflow-hidden">
          {/* Header */}
          <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border transition-[width,height] ease-linear">
            <div className="flex items-center gap-2 px-4">
              <h2 className="text-lg font-semibold">{title}</h2>
            </div>
          </header>
          {/* Scrollable Content Area */}
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 pt-0">
            {children}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
