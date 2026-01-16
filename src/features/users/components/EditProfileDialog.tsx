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
import { isHeicFile } from "@/lib/heic-utils";
import { uploadFile } from "@/lib/upload-utils";
import { Loader, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { Id } from "../../../../convex/_generated/dataModel";
import { HeicImagePreview } from "@/components/HeicImagePreview";

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
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const uploadPromiseRef = useRef<Promise<string> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isPending = isUpdatingUser || isUpdatingProfile || isUploadingImage;

  // Update fields when currentUser or userProfile changes or dialog opens
  // Note: Setting state in effect is acceptable here as we're syncing form state
  // with external data (user profile) when dialog opens - a common pattern for forms
  useEffect(() => {
    if (!open) return;

    // Use a single state update to avoid cascading renders
    const fullNameValue = userProfile?.fullName || currentUser?.name || "";
    const displayNameValue =
      userProfile?.displayName || currentUser?.name || "";
    const titleValue = userProfile?.title || "";
    const pronunciationValue = userProfile?.pronunciation || "";

    // Batch state updates - resetting form state when dialog opens
    setTimeout(() => {
      setFullName(fullNameValue);
      setDisplayName(displayNameValue);
      setTitle(titleValue);
      setPronunciation(pronunciationValue);
      setRemoveImage(false);
      setImage(null);
      setImageStorageId(null);
      setIsUploadingImage(false);
      uploadPromiseRef.current = null;
    }, 0);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [currentUser, userProfile, open]);

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check if it's an image (including HEIC)
    const isImage = file.type.startsWith("image/") || isHeicFile(file);
    if (!isImage) {
      toast.error("Please select an image file");
      return;
    }

    // Check file size (max 20MB)
    if (file.size > 20 * 1024 * 1024) {
      toast.error("Image size must be less than 20MB");
      return;
    }

    setImage(file);
    setIsUploadingImage(true);

    // Create upload promise and store it so we can await it in handleSubmit if needed
    const uploadPromise = uploadFile(file, async () => {
      const url = await generateUploadUrl({ throwError: true });
      return url ?? null;
    });

    uploadPromiseRef.current = uploadPromise;

    try {
      // Upload image (HEIC will be converted to JPEG server-side)
      const storageId = await uploadPromise;
      setImageStorageId(storageId as Id<"_storage">);
      setIsUploadingImage(false);
      uploadPromiseRef.current = null;
    } catch {
      toast.error("Failed to upload image");
      setImage(null);
      setImageStorageId(null);
      setIsUploadingImage(false);
      uploadPromiseRef.current = null;
    }
  };

  const handleRemoveImage = () => {
    setImage(null);
    setImageStorageId(null);
    setRemoveImage(true);
    setIsUploadingImage(false);
    uploadPromiseRef.current = null;
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

    // Wait for image upload to complete if it's still in progress
    let finalImageStorageId = imageStorageId;
    if (image && !imageStorageId && uploadPromiseRef.current) {
      try {
        finalImageStorageId =
          (await uploadPromiseRef.current) as Id<"_storage">;
        setImageStorageId(finalImageStorageId);
      } catch {
        toast.error("Image upload failed. Please try again.");
        return;
      }
    }

    // If user selected an image but upload hasn't completed and there's no promise, show error
    if (image && !finalImageStorageId && !uploadPromiseRef.current) {
      toast.error(
        "Image upload is required. Please wait for upload to complete."
      );
      return;
    }

    try {
      // Update user (name and image)
      await updateUser(
        {
          name: displayName.trim(),
          image: removeImage ? null : finalImageStorageId || undefined,
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

  // Determine if we should show the remove button
  const hasImage = !removeImage && (image || currentUser?.image);

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
              <div className="relative size-32 rounded-lg overflow-hidden border">
                {image ? (
                  <HeicImagePreview
                    file={image}
                    alt="Profile preview"
                    fill
                    className="rounded-lg object-cover"
                  />
                ) : (
                  <Avatar className="size-32 rounded-lg">
                    {/* Always render AvatarImage - pass undefined src when image is removed to trigger fallback */}
                    <AvatarImage
                      src={
                        !removeImage && currentUser?.image
                          ? currentUser.image
                          : undefined
                      }
                      alt={displayName || currentUser?.name || "User"}
                    />
                    {/* Fallback always renders - shows when AvatarImage src is undefined or fails to load */}
                    <AvatarFallback
                      className="text-4xl rounded-lg bg-sky-500 text-white font-semibold flex items-center justify-center"
                      delayMs={0}
                    >
                      {(displayName || currentUser?.name || "U")
                        .charAt(0)
                        .toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
              <input
                type="file"
                accept="image/*,.heic,.heif"
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
                  {isUploadingImage ? (
                    <>
                      <Loader className="size-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <ImageIcon className="size-4 mr-2" />
                      Upload photo
                    </>
                  )}
                </Button>
                {hasImage && (
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    disabled={isPending || isUploadingImage}
                    className="text-sm text-[#1264a3] hover:underline text-left disabled:opacity-50 disabled:cursor-not-allowed"
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
