"use client";

import { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUpdateUser } from "../api/use-update-user";
import { useUpdateUserProfile } from "@/features/userProfiles/api/use-update-user-profile";
import { useGetUserProfile } from "@/features/userProfiles/api/use-get-user-profile";
import { useGenerateUploadUrl } from "@/features/upload/api/use-generate-upload-url";
import { useCurrentUser } from "@/features/auth/api/use-current-user";
import { Loader, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { Id } from "../../../../convex/_generated/dataModel";

interface EditProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditProfileDialog({
  open,
  onOpenChange,
}: EditProfileDialogProps) {
  const { data: currentUser } = useCurrentUser();
  const { data: userProfile } = useGetUserProfile();
  const { mutate: updateUser, isPending: isUpdatingUser } = useUpdateUser();
  const { mutate: updateUserProfile, isPending: isUpdatingProfile } =
    useUpdateUserProfile();
  const { mutate: generateUploadUrl } = useGenerateUploadUrl();
  const [fullName, setFullName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [title, setTitle] = useState("");
  const [pronunciation, setPronunciation] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [imageStorageId, setImageStorageId] = useState<Id<"_storage"> | null>(
    null
  );
  const [removeImage, setRemoveImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isPending = isUpdatingUser || isUpdatingProfile;

  // Update fields when currentUser or userProfile changes or dialog opens
  useEffect(() => {
    if (open) {
      setFullName(userProfile?.fullName || currentUser?.name || "");
      setDisplayName(userProfile?.displayName || currentUser?.name || "");
      setTitle(userProfile?.title || "");
      setPronunciation(userProfile?.pronunciation || "");
      setRemoveImage(false);
      setImage(null);
      setImageStorageId(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }, [currentUser, userProfile, open]);

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image size must be less than 5MB");
      return;
    }

    setImage(file);

    try {
      // Generate upload URL
      const uploadUrl = await generateUploadUrl({ throwError: true });
      if (!uploadUrl) {
        throw new Error("Failed to generate upload URL");
      }

      // Upload image
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "Content-Type": file.type,
        },
        body: file,
      });

      if (!result.ok) {
        throw new Error("Failed to upload image");
      }

      const { storageId } = await result.json();
      setImageStorageId(storageId);
    } catch {
      toast.error("Failed to upload image");
      setImage(null);
      setImageStorageId(null);
    }
  };

  const handleRemoveImage = () => {
    setImage(null);
    setImageStorageId(null);
    setRemoveImage(true);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async () => {
    if (!fullName.trim()) {
      toast.error("Full name cannot be empty");
      return;
    }

    if (!displayName.trim()) {
      toast.error("Display name cannot be empty");
      return;
    }

    try {
      // Update user (name and image)
      await updateUser(
        {
          name: displayName.trim(),
          image: removeImage ? null : imageStorageId || undefined,
        },
        { throwError: true }
      );

      // Update user profile (additional fields)
      await updateUserProfile(
        {
          fullName: fullName.trim(),
          displayName: displayName.trim(),
          title: title.trim() || undefined,
          pronunciation: pronunciation.trim() || undefined,
        },
        { throwError: true }
      );

      toast.success("Profile updated successfully");
      onOpenChange(false);
    } catch (error) {
      toast.error((error as Error).message || "Failed to update profile");
    }
  };

  const handleCancel = () => {
    // Reset form
    setFullName(userProfile?.fullName || currentUser?.name || "");
    setDisplayName(userProfile?.displayName || currentUser?.name || "");
    setTitle(userProfile?.title || "");
    setPronunciation(userProfile?.pronunciation || "");
    setImage(null);
    setImageStorageId(null);
    setRemoveImage(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    onOpenChange(false);
  };

  const displayImage = image
    ? URL.createObjectURL(image)
    : removeImage
    ? null
    : currentUser?.image || null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="text-xl">Edit your profile</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col sm:flex-row gap-8 px-6 pb-6">
          {/* Left Section - Form Fields */}
          <div className="flex-1 flex flex-col gap-6 min-w-0">
            {/* Full name */}
            <div className="flex flex-col gap-2">
              <label
                htmlFor="fullName"
                className="text-sm font-semibold text-foreground"
              >
                Full name
              </label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Enter your full name"
                disabled={isPending}
                maxLength={100}
                className="h-9 border-2 focus:border-[#1264a3] focus:ring-0"
              />
            </div>

            {/* Display name */}
            <div className="flex flex-col gap-2">
              <label
                htmlFor="displayName"
                className="text-sm font-semibold text-foreground"
              >
                Display name
              </label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter your display name"
                disabled={isPending}
                maxLength={50}
                className="h-9 border-2 focus:border-[#1264a3] focus:ring-0"
              />
              <p className="text-xs text-muted-foreground mt-1">
                This could be your first name or a nickname – the name
                you&apos;d like people to use to refer to you in Slack.
              </p>
            </div>

            {/* Title */}
            <div className="flex flex-col gap-2">
              <label
                htmlFor="title"
                className="text-sm font-semibold text-foreground"
              >
                Title
              </label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title"
                disabled={isPending}
                maxLength={100}
                className="h-9 border-2 focus:border-[#1264a3] focus:ring-0"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Let people know what you do.
              </p>
            </div>

            {/* Name pronunciation */}
            <div className="flex flex-col gap-2">
              <label
                htmlFor="pronunciation"
                className="text-sm font-semibold text-foreground"
              >
                Name pronunciation
              </label>
              <Input
                id="pronunciation"
                value={pronunciation}
                onChange={(e) => setPronunciation(e.target.value)}
                placeholder="Emily (pronounced 'em-i-lee')"
                disabled={isPending}
                maxLength={100}
                className="h-9 border-2 focus:border-[#1264a3] focus:ring-0"
              />
              <p className="text-xs text-muted-foreground mt-1">
                This could be a phonetic pronunciation, or an example of
                something that your name sounds like.
              </p>
            </div>
          </div>

          {/* Right Section - Profile Photo */}
          <div className="flex flex-col gap-4 sm:w-64 shrink-0">
            <label className="text-sm font-semibold text-foreground">
              Profile photo
            </label>
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <Avatar className="size-32 rounded-lg">
                  <AvatarImage src={displayImage || undefined} />
                  <AvatarFallback className="text-4xl rounded-lg">
                    {displayName.charAt(0).toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
              </div>
              <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                onChange={handleImageSelect}
                className="hidden"
              />
              <div className="flex flex-col gap-2 w-full">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isPending}
                  className="w-full h-9 border-2"
                >
                  <ImageIcon className="size-4 mr-2" />
                  Upload photo
                </Button>
                {displayImage && (
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    disabled={isPending}
                    className="text-sm text-[#1264a3] hover:underline text-left"
                  >
                    Remove photo
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-2 px-6 pb-6 pt-4 border-t">
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isPending}
            className="h-9"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || !fullName.trim() || !displayName.trim()}
            className="bg-[#007a5a] hover:bg-[#007a5a]/80 text-white h-9"
          >
            {isPending ? (
              <>
                <Loader className="size-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save changes"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
