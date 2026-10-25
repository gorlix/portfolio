import { expect, test } from '@playwright/test';

const cases = [
  { route: '/', labels: ['Umano', 'Recruiter', 'AI Agent'], prefix: '' },
  { route: '/en/', labels: ['Human', 'Recruiter', 'AI Agent'], prefix: '/en' },
];

for (const { route, labels, prefix } of cases) {
  test(`${route}: saluto e tre scelte come link veri, nell'ordine deciso`, async ({ page }) => {
    await page.goto(route);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Alessandro Gorla');

    const links = page.getByRole('list', { name: /chi sei|who are you/i }).getByRole('link');
    await expect(links).toHaveText(labels);
    await expect(links).toHaveCount(3);
    const hrefs = await links.evaluateAll((els) => els.map((e) => e.getAttribute('href')));
    expect(hrefs).toEqual([`${prefix}/human/`, `${prefix}/recruiter/`, `${prefix}/agent/`]);
  });
}
