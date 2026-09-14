import { prisma } from "./prisma.js";
import { queueEmail, flushEmailOutbox } from "./mailer.js";
import { createNotification } from "./notifications.js";
import { runWithoutTenant, runWithTenant } from "./tenant.js";

async function digestItemsForSchool(schoolId) {
  return runWithTenant(schoolId, async () => {
    const [pendingStaff, pendingAccess, upcomingDeadlines, unreadNotices] = await Promise.all([
      prisma.user.count({ where: { status: "PENDING" } }),
      prisma.markEntryAccessRequest.count({ where: { status: "PENDING" } }),
      prisma.exam.findMany({
        where: {
          marksEntryDeadline: {
            gte: new Date().toISOString(),
            lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          },
        },
        select: { id: true, name: true, marksEntryDeadline: true },
        orderBy: { marksEntryDeadline: "asc" },
        take: 8,
      }),
      prisma.notification.count({
        where: {
          readAt: null,
          user: { role: { in: ["PRINCIPAL", "EXAM_COORDINATOR"] }, status: "ACTIVE" },
        },
      }),
    ]);
    return { pendingStaff, pendingAccess, upcomingDeadlines, unreadNotices };
  });
}

function formatDigestBody(school, items) {
  const lines = [
    `Digest for ${school.name}`,
    "",
    `Pending staff approvals: ${items.pendingStaff}`,
    `Pending late-entry / edit requests: ${items.pendingAccess}`,
    `Unread leadership notices: ${items.unreadNotices}`,
    "",
    "Upcoming mark-entry deadlines (7 days):",
  ];
  if (!items.upcomingDeadlines.length) {
    lines.push("  (none)");
  } else {
    for (const exam of items.upcomingDeadlines) {
      lines.push(`  • ${exam.name} — ${exam.marksEntryDeadline}`);
    }
  }
  lines.push("", "Open the school desk for details.");
  return lines.join("\n");
}

/**
 * Build and queue leadership digests for schools with emailDigestsEnabled.
 */
export async function runSchoolDigests({ flush = true } = {}) {
  const schools = await runWithoutTenant(() =>
    prisma.school.findMany({
      where: { status: "ACTIVE", emailDigestsEnabled: true },
      select: {
        id: true,
        name: true,
        email: true,
        digestEmail: true,
        principalName: true,
      },
    })
  );

  const results = [];
  for (const school of schools) {
    const items = await digestItemsForSchool(school.id);
    const body = formatDigestBody(school, items);
    const toEmail = school.digestEmail || school.email;
    let queued = false;
    let notified = 0;

    await runWithTenant(school.id, async () => {
      const leaders = await prisma.user.findMany({
        where: { role: { in: ["PRINCIPAL", "EXAM_COORDINATOR"] }, status: "ACTIVE" },
        select: { id: true, email: true },
      });
      for (const leader of leaders) {
        await createNotification({
          userId: leader.id,
          type: "DIGEST",
          title: "School operations digest",
          body: `Pending staff ${items.pendingStaff}, access requests ${items.pendingAccess}, deadlines ${items.upcomingDeadlines.length}.`,
          link: "/",
          meta: items,
        });
        notified += 1;
        if (leader.email) {
          await queueEmail({
            tenantId: school.id,
            toEmail: leader.email,
            subject: `[${school.name}] Daily operations digest`,
            bodyText: body,
            kind: "school_digest",
            meta: { schoolId: school.id, ...items },
          });
          queued = true;
        }
      }
      if (!queued && toEmail) {
        await queueEmail({
          tenantId: school.id,
          toEmail,
          subject: `[${school.name}] Daily operations digest`,
          bodyText: body,
          kind: "school_digest",
          meta: { schoolId: school.id, ...items },
        });
        queued = true;
      }
    });

    results.push({
      schoolId: school.id,
      name: school.name,
      notified,
      emailed: queued,
      ...items,
    });
  }

  const flushResult = flush ? await flushEmailOutbox() : null;
  return { schools: results.length, results, flush: flushResult };
}
