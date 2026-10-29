/**
 * The landing's sign-in: it checks what was typed, says what is wrong under the field itself (read with it by screen
 * readers, through its aria-describedby) and takes the captain to the game, in the page's language (the form's action
 * names it: play/?lang=uk). The landing is a page a language (/, /uk/, /ru/), and what this script says is in the
 * page's
 */

interface Field {
  readonly input: HTMLInputElement;
  readonly error: HTMLElement;
  /** What is wrong with what was typed, or '' */
  readonly problem: (input: HTMLInputElement) => string;
}

const EMAIL_EXAMPLE = 'captain@example.com';

/** What the script says, in each of the landing's languages */
interface Words {
  readonly emailMissing: string;
  readonly emailWrong: string;
  readonly passwordMissing: string;
  readonly sailing: string;
}

const EN: Words = {
  emailMissing: 'Enter your email address',
  emailWrong: `Enter an email address like ${EMAIL_EXAMPLE}`,
  passwordMissing: 'Enter your password',
  sailing: 'Setting sail…',
};
const UK: Words = {
  emailMissing: 'Введіть адресу електронної пошти',
  emailWrong: `Введіть адресу на зразок ${EMAIL_EXAMPLE}`,
  passwordMissing: 'Введіть пароль',
  sailing: 'Відчалюємо…',
};
const RU: Words = {
  emailMissing: 'Введите адрес электронной почты',
  emailWrong: `Введите адрес вида ${EMAIL_EXAMPLE}`,
  passwordMissing: 'Введите пароль',
  sailing: 'Отчаливаем…',
};
const page = document.documentElement.lang;
const words = page === 'uk' ? UK : page === 'ru' ? RU : EN;

/** The landing's element `id`, of the kind `type` (HTMLInputElement…) */
function byId<T extends HTMLElement>(id: string, type: new () => T): T {
  const element = document.getElementById(id);
  if (!(element instanceof type)) throw new Error(`The landing has no ${type.name} #${id}`);
  return element;
}

function emailProblem(input: HTMLInputElement) {
  if (input.validity.valueMissing) return words.emailMissing;
  if (input.validity.typeMismatch) return words.emailWrong;
  return '';
}

function passwordProblem(input: HTMLInputElement) {
  return input.validity.valueMissing ? words.passwordMissing : '';
}

/** Shows what is wrong with a field, or clears it; whether the field is right */
function check(field: Field) {
  const problem = field.problem(field.input);
  field.error.textContent = problem;
  if (problem) field.input.setAttribute('aria-invalid', 'true');
  else field.input.removeAttribute('aria-invalid');
  return !problem;
}

const form = byId('sign-in-form', HTMLFormElement);
const password = byId('password', HTMLInputElement);
const reveal = byId('show-password', HTMLInputElement);
const status = byId('sign-in-status', HTMLElement);
const fields: readonly Field[] = [
  { input: byId('email', HTMLInputElement), error: byId('email-error', HTMLElement), problem: emailProblem },
  { input: password, error: byId('password-error', HTMLElement), problem: passwordProblem },
];

// The browser's bubbles vanish before a screen reader or a slow reader takes them in: the page says it under the field
form.noValidate = true;

for (const field of fields) {
  // Only a field already marked wrong is checked as it is typed in: the error goes the moment it is put right, and none
  // shows up halfway through typing
  field.input.addEventListener('input', () => {
    if (field.input.hasAttribute('aria-invalid')) check(field);
  });
}

byId('show-password-row', HTMLElement).hidden = false;
reveal.addEventListener('change', () => {
  password.type = reveal.checked ? 'text' : 'password';
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const wrong = fields.filter((field) => !check(field));
  if (wrong.length > 0) {
    wrong[0].input.focus();
    return;
  }
  // Hidden again, so the browser doesn't keep the password among the texts typed into the form
  password.type = 'password';
  reveal.checked = false;
  status.textContent = words.sailing;
  // There is no server yet, so any email and password let the captain aboard: the server will check them here
  window.location.assign(form.action);
});

// Back from the game, the page may come out of the browser's cache as it was left
window.addEventListener('pageshow', () => {
  status.textContent = '';
});
