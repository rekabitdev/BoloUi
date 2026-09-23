/**
 * @license
 * Copyright 2026 BoloUi (boloui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
import { Button, Input, Message, Modal, Space, Tag, Typography } from '@arco-design/web-react';
import { Delete, Plus } from '@icon-park/react';
import React, { useEffect, useMemo, useState } from 'react';

export type ProjectMarkdownDocument = {
  name: string;
  content: string;
};

export type ProjectProfile = {
  instructions: string;
  skills: string[];
  context: string;
  documents: ProjectMarkdownDocument[];
};

type Props = {
  visible: boolean;
  projectKey: string;
  projectName: string;
  onClose: () => void;
};

const EMPTY_PROFILE: ProjectProfile = {
  instructions: '',
  skills: [],
  context: '',
  documents: [{ name: 'SOUL.md', content: '' }],
};

const storageKey = (projectKey: string) => `boloui.projectProfile.${encodeURIComponent(projectKey)}`;

function loadProfile(projectKey: string): ProjectProfile {
  try {
    const value = localStorage.getItem(storageKey(projectKey));
    if (!value) return EMPTY_PROFILE;
    const parsed = JSON.parse(value) as Partial<ProjectProfile>;
    return {
      instructions: typeof parsed.instructions === 'string' ? parsed.instructions : '',
      skills: Array.isArray(parsed.skills) ? parsed.skills.filter((skill): skill is string => typeof skill === 'string') : [],
      context: typeof parsed.context === 'string' ? parsed.context : '',
      documents: Array.isArray(parsed.documents)
        ? parsed.documents.filter(
            (document): document is ProjectMarkdownDocument =>
              typeof document?.name === 'string' && typeof document?.content === 'string'
          )
        : EMPTY_PROFILE.documents,
    };
  } catch {
    return EMPTY_PROFILE;
  }
}

const normalizeMarkdownName = (name: string): string => {
  const safeName = name.trim().replace(/[\\/:*?"<>|]/g, '-');
  if (!safeName) return '';
  return safeName.toLowerCase().endsWith('.md') ? safeName : `${safeName}.md`;
};

const ProjectProfileModal: React.FC<Props> = ({ visible, projectKey, projectName, onClose }) => {
  const [profile, setProfile] = useState<ProjectProfile>(EMPTY_PROFILE);
  const [skillInput, setSkillInput] = useState('');
  const [documentName, setDocumentName] = useState('');

  useEffect(() => {
    if (visible) setProfile(loadProfile(projectKey));
  }, [projectKey, visible]);

  const duplicateDocumentNames = useMemo(() => {
    const names = profile.documents.map((document) => document.name.toLowerCase());
    return names.some((name, index) => names.indexOf(name) !== index);
  }, [profile.documents]);

  const addSkill = () => {
    const skill = skillInput.trim();
    if (!skill || profile.skills.includes(skill)) return;
    setProfile((current) => ({ ...current, skills: [...current.skills, skill] }));
    setSkillInput('');
  };

  const addDocument = () => {
    const name = normalizeMarkdownName(documentName);
    if (!name) return;
    if (profile.documents.some((document) => document.name.toLowerCase() === name.toLowerCase())) {
      Message.warning('A Markdown file with this name already exists.');
      return;
    }
    setProfile((current) => ({ ...current, documents: [...current.documents, { name, content: '' }] }));
    setDocumentName('');
  };

  const save = () => {
    if (duplicateDocumentNames) {
      Message.error('Markdown file names must be unique.');
      return;
    }
    localStorage.setItem(storageKey(projectKey), JSON.stringify(profile));
    Message.success('Project profile saved');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      title={`Project profile — ${projectName}`}
      onCancel={onClose}
      onOk={save}
      okText='Save project'
      cancelText='Cancel'
      style={{ width: 720 }}
      unmountOnExit
    >
      <Space direction='vertical' size='large' className='w-full'>
        <div>
          <Typography.Title heading={6}>Custom instructions</Typography.Title>
          <Input.TextArea
            value={profile.instructions}
            onChange={(instructions) => setProfile((current) => ({ ...current, instructions }))}
            placeholder='Rules and behavior that apply to conversations in this project'
            autoSize={{ minRows: 3, maxRows: 8 }}
          />
        </div>

        <div>
          <Typography.Title heading={6}>Skills</Typography.Title>
          <Space className='w-full'>
            <Input
              value={skillInput}
              onChange={setSkillInput}
              onPressEnter={addSkill}
              placeholder='Skill name or identifier'
            />
            <Button icon={<Plus />} onClick={addSkill}>Add</Button>
          </Space>
          <div className='mt-8px flex flex-wrap gap-6px'>
            {profile.skills.map((skill) => (
              <Tag
                key={skill}
                closable
                onClose={() => setProfile((current) => ({ ...current, skills: current.skills.filter((item) => item !== skill) }))}
              >
                {skill}
              </Tag>
            ))}
          </div>
        </div>

        <div>
          <Typography.Title heading={6}>Project context</Typography.Title>
          <Input.TextArea
            value={profile.context}
            onChange={(context) => setProfile((current) => ({ ...current, context }))}
            placeholder='Background, goals, constraints, conventions, and other shared context'
            autoSize={{ minRows: 3, maxRows: 8 }}
          />
        </div>

        <div>
          <Typography.Title heading={6}>Markdown context files</Typography.Title>
          <Typography.Paragraph type='secondary'>Maintain SOUL.md and any additional .md project documents.</Typography.Paragraph>
          <Space className='w-full mb-12px'>
            <Input
              value={documentName}
              onChange={setDocumentName}
              onPressEnter={addDocument}
              placeholder='Example: RULES.md'
            />
            <Button icon={<Plus />} onClick={addDocument}>Add file</Button>
          </Space>
          <Space direction='vertical' className='w-full'>
            {profile.documents.map((document, index) => (
              <div key={`${document.name}-${index}`} className='border border-solid border-[var(--color-border-2)] rd-8px p-12px'>
                <div className='flex items-center gap-8px mb-8px'>
                  <Input
                    value={document.name}
                    onChange={(name) =>
                      setProfile((current) => ({
                        ...current,
                        documents: current.documents.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, name: normalizeMarkdownName(name) } : item
                        ),
                      }))
                    }
                    disabled={document.name.toLowerCase() === 'soul.md'}
                  />
                  {document.name.toLowerCase() !== 'soul.md' && (
                    <Button
                      status='danger'
                      type='text'
                      icon={<Delete />}
                      onClick={() =>
                        setProfile((current) => ({
                          ...current,
                          documents: current.documents.filter((_, itemIndex) => itemIndex !== index),
                        }))
                      }
                    />
                  )}
                </div>
                <Input.TextArea
                  value={document.content}
                  onChange={(content) =>
                    setProfile((current) => ({
                      ...current,
                      documents: current.documents.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, content } : item
                      ),
                    }))
                  }
                  placeholder={`Content for ${document.name}`}
                  autoSize={{ minRows: 4, maxRows: 12 }}
                />
              </div>
            ))}
          </Space>
        </div>
      </Space>
    </Modal>
  );
};

export default ProjectProfileModal;
