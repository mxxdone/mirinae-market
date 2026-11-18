export function focusFirstInvalidField(form: HTMLFormElement): void {
  // 오류 설명이 DOM에 반영된 뒤 입력란에 포커스를 옮긴다.
  requestAnimationFrame(() => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
}

export function focusAuthHeading(heading: HTMLHeadingElement | null): (() => void) | undefined {
  if (!heading) return;

  const previousTitle = document.title;
  document.title = `${heading.innerText.trim()} · 미리내 마켓`;
  heading.focus();

  return () => {
    document.title = previousTitle;
  };
}
