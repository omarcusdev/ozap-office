import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api-client"

export const useMeetingMessagesQuery = (meetingId: string | null) =>
  useQuery({
    queryKey: ["meeting-messages", meetingId],
    queryFn: () => api.getMeetingMessages(meetingId!),
    enabled: !!meetingId,
  })

export const useCreateMeetingMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (topic?: string) => api.createMeeting(topic),
    onSuccess: (meeting) => {
      queryClient.setQueryData(["meeting", meeting.id], meeting)
    },
  })
}

export const useSendMeetingMessageMutation = () =>
  useMutation({
    mutationFn: ({ meetingId, content }: { meetingId: string; content: string }) =>
      api.sendMeetingMessage(meetingId, content),
  })
