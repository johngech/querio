import 'reflect-metadata';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'org' })
export class Org {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string;
}

@Entity({ name: 'user' })
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ unique: true })
  email: string;

  @Column()
  age: number;

  @Column()
  status: string;

  @Column()
  role: string;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'integer', nullable: true })
  orgId: number | null;

  @ManyToOne(() => Org, { nullable: true })
  @JoinColumn({ name: 'orgId' })
  org: Org | null;
}
