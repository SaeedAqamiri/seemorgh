import { NotificationsList } from "@/components/notifications-list";
import { requireCounselor } from "@/lib/auth";
import { listNotifications } from "@/lib/notifications";

export default async function CounselorNotificationsPage() {
  const user = await requireCounselor();
  const items = await listNotifications(user.id);
  return <NotificationsList items={items} role="counselor" />;
}
