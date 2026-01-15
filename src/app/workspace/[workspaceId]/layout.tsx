"use client";

import { PropsWithChildren } from "react";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Toolbar } from "@/features/workspaces/layout/Toolbar";
import { Sidebar } from "@/features/workspaces/layout/Sidebar";
import { WorkspaceSidebar } from "@/features/workspaces/layout/WorkspaceSidebar";
import { usePanel } from "@/hooks/use-panel";
import { Loader } from "lucide-react";
import { Id } from "../../../../convex/_generated/dataModel";
import { Thread } from "@/features/messages/components/Thread";
import { Profile } from "@/features/members/components/Profile";
import { useGlobalNotifications } from "@/hooks/use-global-notifications";
import { usePresence } from "@/features/presence/api/use-presence";
import { useWorkspaceId } from "@/hooks/use-workspace-id";
import { useHuddleNotifications } from "@/features/huddle/hooks/use-huddle-notifications";
import { useGetWorkspace } from "@/features/workspaces/api/use-get-workspace";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { LiveKitRoomProvider } from "@/features/live-kit/provider/LiveKitRoomProvider";
import { UnifiedSettingsDialog } from "@/components/UnifiedSettingsDialog";

export default function WorkspaceIdLayout({ children }: PropsWithChildren) {
  const workspaceId = useWorkspaceId();
  const { data: workspace } = useGetWorkspace({
    id: workspaceId,
  });

  // Update document title based on workspace name
  useDocumentTitle(workspace?.name);

  // Global notifications for all workspace messages
  useGlobalNotifications();

  // Huddle notifications (for incoming huddles)
  useHuddleNotifications();

  // Track user presence (online/offline status)
  usePresence({ workspaceId: workspaceId!, enabled: !!workspaceId });
  const { parentMessageId, profileMemberId, onCloseMessage, onCloseProfile } =
    usePanel();

  const showPanel = !!parentMessageId || !!profileMemberId;

  function onClose() {
    if (parentMessageId) {
      onCloseMessage();
    } else if (profileMemberId) {
      onCloseProfile();
    }
  }

  return (
    <LiveKitRoomProvider>
      <div className="h-full">
        <Toolbar />
        <div className="flex h-[calc(100vh-40px)]">
          <Sidebar />
          <ResizablePanelGroup
            direction="horizontal"
            autoSaveId="ca-workspace-layout"
          >
            <ResizablePanel
              defaultSize={20}
              minSize={11}
              className="bg-[#5E2C5F]"
            >
              <WorkspaceSidebar />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel minSize={20} defaultSize={80}>
              {children}
            </ResizablePanel>
            {showPanel && (
              <>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={29} minSize={20}>
                  {parentMessageId ? (
                    <Thread
                      messageId={parentMessageId as Id<"messages">}
                      onClose={onClose}
                    />
                  ) : profileMemberId ? (
                    <Profile
                      memberId={profileMemberId as Id<"members">}
                      onClose={onClose}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <Loader className="size-5 animate-spin text-muted-foreground" />
                    </div>
                  )}
                </ResizablePanel>
              </>
            )}
          </ResizablePanelGroup>
        </div>
        <UnifiedSettingsDialog />
      </div>
    </LiveKitRoomProvider>
  );
}
