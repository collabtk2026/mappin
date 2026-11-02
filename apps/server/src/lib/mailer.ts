export interface Mail {
  to: string;
  subject: string;
  text: string;
}
export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/** 개발용: 메일을 로그로 남기고 최근 메일을 보관 (테스트에서 토큰 추출) */
export class MemoryMailer implements Mailer {
  sent: Mail[] = [];
  constructor(private log?: (msg: string) => void) {}
  async send(mail: Mail) {
    this.sent.push(mail);
    this.log?.(`[mail] to=${mail.to} subject=${mail.subject}\n${mail.text}`);
  }
}

/** 운영용: SMTP_URL (예: smtps://user:pass@smtp.example.com:465) */
export class SmtpMailer implements Mailer {
  private transport: import('nodemailer').Transporter | null = null;
  constructor(private url: string, private from: string) {}
  async send(mail: Mail) {
    if (!this.transport) {
      const nodemailer = await import('nodemailer');
      this.transport = nodemailer.createTransport(this.url);
    }
    await this.transport.sendMail({ from: this.from, to: mail.to, subject: mail.subject, text: mail.text });
  }
}
