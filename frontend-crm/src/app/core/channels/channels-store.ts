import { Injectable, computed, effect, signal } from '@angular/core';

/*
 * Canales de salida: correo (SMTP) y SMS. El navegador no puede abrir una
 * conexión SMTP ni llamar al proveedor de SMS, así que aquí sólo se valida que
 * la configuración esté completa y sea coherente; el envío real lo hará el
 * backend con estos mismos datos.
 */

export type SmtpSecurity = 'starttls' | 'ssl' | 'none';
export type SmsProvider = 'twilio' | 'messagebird' | 'vonage' | 'other';
export type ChannelStatus = 'ready' | 'incomplete' | 'disabled';

export interface SmtpConfig {
  readonly enabled: boolean;
  readonly host: string;
  readonly port: number;
  readonly security: SmtpSecurity;
  readonly username: string;
  readonly fromName: string;
  readonly fromEmail: string;
  readonly replyTo: string;
  readonly updatedAt: string;
  readonly updatedBy: string;
}

export interface SmsConfig {
  readonly enabled: boolean;
  readonly provider: SmsProvider;
  readonly accountId: string;
  /** `number`: teléfono E.164; `alphanumeric`: nombre de remitente (p. ej. SPEEDLINK). */
  readonly senderType: 'number' | 'alphanumeric';
  readonly sender: string;
  /** No se envían SMS automáticos en este horario (hora local). */
  readonly quietHours: boolean;
  readonly quietStart: string;
  readonly quietEnd: string;
  readonly updatedAt: string;
  readonly updatedBy: string;
}

/** Contraseña SMTP y token SMS: nunca se devuelven a la pantalla una vez guardados. */
interface ChannelSecrets {
  smtpPassword: string;
  smsToken: string;
}

export const SMTP_SECURITY: ReadonlyArray<{ value: SmtpSecurity; label: string; port: number }> = [
  { value: 'starttls', label: 'STARTTLS (recomendado)', port: 587 },
  { value: 'ssl', label: 'SSL/TLS', port: 465 },
  { value: 'none', label: 'Sin cifrado', port: 25 },
];

export const SMS_PROVIDERS: ReadonlyArray<{
  value: SmsProvider;
  label: string;
  accountLabel: string;
  tokenLabel: string;
}> = [
  { value: 'twilio', label: 'Twilio', accountLabel: 'Account SID', tokenLabel: 'Auth token' },
  { value: 'messagebird', label: 'MessageBird', accountLabel: 'Workspace ID', tokenLabel: 'Access key' },
  { value: 'vonage', label: 'Vonage', accountLabel: 'API key', tokenLabel: 'API secret' },
  { value: 'other', label: 'Otro proveedor', accountLabel: 'Usuario / ID de cuenta', tokenLabel: 'Token' },
];

const SEED_DATE = '2026-01-12T09:30:00-06:00';

const SEED_SMTP: SmtpConfig = {
  enabled: true,
  host: 'smtp.speedlink.mx',
  port: 587,
  security: 'starttls',
  username: 'notificaciones@speedlink.mx',
  fromName: 'SpeedLink Telecom',
  fromEmail: 'notificaciones@speedlink.mx',
  replyTo: 'contacto@speedlink.mx',
  updatedAt: SEED_DATE,
  updatedBy: 'Andrea Torres',
};

const SEED_SMS: SmsConfig = {
  enabled: false,
  provider: 'twilio',
  accountId: '',
  senderType: 'number',
  sender: '',
  quietHours: true,
  quietStart: '21:00',
  quietEnd: '08:00',
  updatedAt: SEED_DATE,
  updatedBy: 'Andrea Torres',
};

const SMTP_KEY = 'speedlink-channel-smtp';
const SMS_KEY = 'speedlink-channel-sms';
const SECRETS_KEY = 'speedlink-channel-secrets';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const HOST_PATTERN = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export type SmtpInput = Omit<SmtpConfig, 'updatedAt' | 'updatedBy'>;
export type SmsInput = Omit<SmsConfig, 'updatedAt' | 'updatedBy'>;
export type FieldErrors<T> = Partial<Record<keyof T | 'secret', string>>;
export type ChannelResult = { ok: true } | { ok: false; error: string };

@Injectable({ providedIn: 'root' })
export class ChannelsStore {
  readonly smtp = signal<SmtpConfig>(this.read(SMTP_KEY, SEED_SMTP));
  readonly sms = signal<SmsConfig>(this.read(SMS_KEY, SEED_SMS));
  private readonly secrets = signal<ChannelSecrets>(
    // El SMTP de demostración ya trae contraseña para poder redactar correos.
    this.read(SECRETS_KEY, { smtpPassword: 'demo-secret', smsToken: '' }),
  );

  readonly hasSmtpPassword = computed(() => !!this.secrets().smtpPassword);
  readonly hasSmsToken = computed(() => !!this.secrets().smsToken);

  readonly smtpStatus = computed<ChannelStatus>(() => {
    const config = this.smtp();
    if (!config.enabled) return 'disabled';
    return Object.keys(this.validateSmtp(config, false)).length ? 'incomplete' : 'ready';
  });
  readonly smsStatus = computed<ChannelStatus>(() => {
    const config = this.sms();
    if (!config.enabled) return 'disabled';
    return Object.keys(this.validateSms(config, false)).length ? 'incomplete' : 'ready';
  });

  constructor() {
    effect(() => this.persist(SMTP_KEY, this.smtp()));
    effect(() => this.persist(SMS_KEY, this.sms()));
    effect(() => this.persist(SECRETS_KEY, this.secrets()));
  }

  // ------------------------------------------------------------------- SMTP

  /** `newPassword`: si viene, reemplaza la guardada; vacío conserva la actual. */
  validateSmtp(input: SmtpInput, checkSecret = true, newPassword = ''): FieldErrors<SmtpInput> {
    const errors: FieldErrors<SmtpInput> = {};
    if (!HOST_PATTERN.test(input.host.trim())) errors.host = 'Servidor inválido, p. ej. smtp.tudominio.com';
    if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535)
      errors.port = 'Puerto entre 1 y 65535.';
    if (!input.username.trim()) errors.username = 'Escribe el usuario de la cuenta.';
    if (!input.fromName.trim()) errors.fromName = 'Escribe el nombre que verán los destinatarios.';
    if (!EMAIL_PATTERN.test(input.fromEmail.trim())) errors.fromEmail = 'Correo con formato inválido.';
    if (input.replyTo.trim() && !EMAIL_PATTERN.test(input.replyTo.trim()))
      errors.replyTo = 'Correo con formato inválido.';
    const hasPassword = newPassword.length > 0 || this.hasSmtpPassword();
    if (checkSecret ? !hasPassword : !this.hasSmtpPassword())
      errors.secret = 'Falta la contraseña de la cuenta.';
    return errors;
  }

  /** Advertencias que no bloquean: combinaciones que suelen fallar al conectar. */
  smtpWarnings(input: SmtpInput): string[] {
    const warnings: string[] = [];
    const expected = SMTP_SECURITY.find((item) => item.value === input.security)?.port;
    if (expected && input.port !== expected)
      warnings.push(`Con ${input.security === 'ssl' ? 'SSL/TLS' : input.security === 'starttls' ? 'STARTTLS' : 'sin cifrado'} el puerto habitual es ${expected}.`);
    if (input.security === 'none')
      warnings.push('Sin cifrado, la contraseña viaja en texto plano: úsalo sólo en redes internas.');
    const fromDomain = input.fromEmail.split('@')[1]?.toLowerCase();
    const userDomain = input.username.split('@')[1]?.toLowerCase();
    if (fromDomain && userDomain && fromDomain !== userDomain)
      warnings.push(`El remitente (@${fromDomain}) no es del dominio de la cuenta (@${userDomain}); muchos servidores lo rechazan o lo marcan como spam.`);
    return warnings;
  }

  saveSmtp(input: SmtpInput, newPassword: string, actor: string): ChannelResult {
    const clean: SmtpInput = {
      ...input,
      host: input.host.trim().toLowerCase(),
      username: input.username.trim(),
      fromName: input.fromName.trim(),
      fromEmail: input.fromEmail.trim().toLowerCase(),
      replyTo: input.replyTo.trim().toLowerCase(),
    };
    // Apagado se puede guardar incompleto; encendido debe estar listo para enviar.
    if (clean.enabled && Object.keys(this.validateSmtp(clean, true, newPassword)).length)
      return { ok: false, error: 'Revisa los campos marcados.' };
    if (newPassword) this.secrets.update((secrets) => ({ ...secrets, smtpPassword: newPassword }));
    this.smtp.set({ ...clean, updatedAt: new Date().toISOString(), updatedBy: actor });
    return { ok: true };
  }

  // -------------------------------------------------------------------- SMS

  validateSms(input: SmsInput, checkSecret = true, newToken = ''): FieldErrors<SmsInput> {
    const errors: FieldErrors<SmsInput> = {};
    if (input.accountId.trim().length < 4) errors.accountId = 'Escribe el identificador de la cuenta.';
    if (input.senderType === 'number') {
      if (!/^\+[1-9]\d{7,14}$/.test(input.sender.replace(/\s/g, '')))
        errors.sender = 'Formato internacional, p. ej. +5215512345678.';
    } else if (!/^(?=.*[A-Za-z])[A-Za-z0-9 ]{3,11}$/.test(input.sender.trim())) {
      errors.sender = 'De 3 a 11 letras o números, con al menos una letra.';
    }
    if (input.quietHours && (!input.quietStart || !input.quietEnd || input.quietStart === input.quietEnd))
      errors.quietStart = 'Indica un horario de inicio y fin distintos.';
    const hasToken = newToken.length > 0 || this.hasSmsToken();
    if (checkSecret ? !hasToken : !this.hasSmsToken()) errors.secret = 'Falta el token del proveedor.';
    return errors;
  }

  saveSms(input: SmsInput, newToken: string, actor: string): ChannelResult {
    const clean: SmsInput = {
      ...input,
      accountId: input.accountId.trim(),
      sender:
        input.senderType === 'number'
          ? input.sender.replace(/\s/g, '')
          : input.sender.trim().toUpperCase(),
    };
    if (clean.enabled && Object.keys(this.validateSms(clean, true, newToken)).length)
      return { ok: false, error: 'Revisa los campos marcados.' };
    if (newToken) this.secrets.update((secrets) => ({ ...secrets, smsToken: newToken }));
    this.sms.set({ ...clean, updatedAt: new Date().toISOString(), updatedBy: actor });
    return { ok: true };
  }

  /** ¿Cae la hora dada dentro del horario sin envíos? Maneja rangos que cruzan medianoche. */
  inQuietHours(time: string, config: Pick<SmsConfig, 'quietHours' | 'quietStart' | 'quietEnd'> = this.sms()): boolean {
    if (!config.quietHours) return false;
    const { quietStart: start, quietEnd: end } = config;
    return start < end ? time >= start && time < end : time >= start || time < end;
  }

  private read<T>(key: string, fallback: T): T {
    try {
      const stored = JSON.parse(localStorage.getItem(key) ?? 'null');
      return stored ? { ...fallback, ...stored } : fallback;
    } catch {
      return fallback;
    }
  }

  private persist(key: string, value: unknown): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Sin almacenamiento los cambios duran sólo esta sesión.
    }
  }
}

// ----------------------------------------------------------- Segmentos SMS

const GSM7 =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM7_EXTENDED = '^{}\\[~]|€';

export interface SmsSegments {
  readonly encoding: 'GSM-7' | 'Unicode';
  readonly length: number;
  readonly segments: number;
  readonly perSegment: number;
}

/**
 * Cuántos SMS cobra el operador por un texto. GSM-7 cabe en 160 caracteres (153
 * por parte si se divide); un solo carácter fuera del alfabeto (acentos como
 * "á", emojis) pasa todo el mensaje a Unicode: 70 (67 por parte).
 */
export function smsSegments(text: string): SmsSegments {
  const chars = Array.from(text);
  const unicode = chars.some((char) => !GSM7.includes(char) && !GSM7_EXTENDED.includes(char));
  const length = unicode
    ? chars.length
    : chars.reduce((total, char) => total + (GSM7_EXTENDED.includes(char) ? 2 : 1), 0);
  const [single, multi] = unicode ? [70, 67] : [160, 153];
  const segments = length === 0 ? 0 : length <= single ? 1 : Math.ceil(length / multi);
  return {
    encoding: unicode ? 'Unicode' : 'GSM-7',
    length,
    segments,
    perSegment: segments > 1 ? multi : single,
  };
}
