/**
 * @license
 * Copyright 2026 BoloUi (boloui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
import { ipcBridge } from '@/common';
import { useProvidersQuery } from '@/renderer/hooks/agent/useModelProviderList';
import { Button, Input, Message, Modal, Select, Space, Tag, Typography } from '@arco-design/web-react';
import { Delete, FolderOpen, Plus } from '@icon-park/react';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

export type ProjectMarkdownDocument = {
  name: string;
  content: string;
};

export type ProjectProfile = {
  instructions: string;
  skills: string[];
  context: string;
  memory: string;
  model?: { providerId: string; modelId: string };
  coworkWorkspace?: string;
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
  memory: '',
  documents: [{ name: 'SOUL.md', content: '' }],
};

export const projectProfileStorageKey = (projectKey: string) =>
  `boloui.projectProfile.${encodeURIComponent(projectKey)}`;

function parseLegacyProjectProfile(projectKey: string): ProjectProfile | null {
  try {
    const value = localStorage.getItem(projectProfileStorageKey(projectKey));
    if (!value) return null;
    const parsed = JSON.parse(value) as Partial<ProjectProfile>;
    return {
      instructions: typeof parsed.instructions === 'string' ? parsed.instructions : '',
      skills: Array.isArray(parsed.skills) ? parsed.skills.filter((skill): skill is string => typeof skill === 'string') : [],
      context: typeof parsed.context === 'string' ? parsed.context : '',
      memory: typeof parsed.memory === 'string' ? parsed.memory : '',
      model:
        typeof parsed.model?.providerId === 'string' && typeof parsed.model?.modelId === 'string'
          ? parsed.model
          : undefined,
      coworkWorkspace: typeof parsed.coworkWorkspace === 'string' ? parsed.coworkWorkspace : undefined,
      documents: Array.isArray(parsed.documents)
        ? parsed.documents.filter(
            (document): document is ProjectMarkdownDocument =>
              typeof document?.name === 'string' && typeof document?.content === 'string'
          )
        : EMPTY_PROFILE.documents,
    };
  } catch {
    return null;
  }
}

export async function loadProjectProfile(projectKey: string, projectName = projectKey): Promise<ProjectProfile> {
  const legacyProfile = parseLegacyProjectProfile(projectKey);
  const stored = await ipcBridge.desktopProjects.get.invoke({ workspace: projectKey });

  if (legacyProfile) {
    const now = new Date().toISOString();
    await ipcBridge.desktopProjects.upsert.invoke({
      entry: {
        id: stored?.id ?? crypto.randomUUID(),
        name: stored?.name ?? projectName,
        workspace: projectKey,
        createdAt: stored?.createdAt ?? now,
        updatedAt: now,
      },
      profile: legacyProfile,
    });
    localStorage.removeItem(projectProfileStorageKey(projectKey));
    return legacyProfile;
  }

  if (stored) {
    const { instructions, skills, context, memory, model, coworkWorkspace, documents } = stored;
    return { instructions, skills, context, memory, model, coworkWorkspace, documents };
  }

  return EMPTY_PROFILE;
}

const normalizeMarkdownName = (name: string): string => {
  const safeName = name.trim().replace(/[\\/:*?"<>|]/g, '-');
  if (!safeName) return '';
  return safeName.toLowerCase().endsWith('.md') ? safeName : `${safeName}.md`;
};

const ProjectProfileModal: React.FC<Props> = ({ visible, projectKey, projectName, onClose }) => {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<ProjectProfile>(EMPTY_PROFILE);
  const { data: providers = [] } = useProvidersQuery();
  const [availableSkills, setAvailableSkills] = useState<Array<{ name: string; description: string }>>([]);
  const [profileHydrated, setProfileHydrated] = useState(false);
  const [skillInput, setSkillInput] = useState('');
  const [documentName, setDocumentName] = useState('');

  useEffect(() => {
    if (!visible) return;
    setProfileHydrated(false);
    void loadProjectProfile(projectKey, projectName)
      .then((storedProfile) => setProfile(storedProfile))
      .catch((error: unknown) => {
        console.error('Failed to load project profile:', error);
        setProfile(EMPTY_PROFILE);
      })
      .finally(() => setProfileHydrated(true));
    void ipcBridge.fs.listAvailableSkills
      .invoke()
      .then((skills) => setAvailableSkills(skills.map(({ name, description }) => ({ name, description }))))
      .catch((error: unknown) => {
        console.error('Failed to load project skills:', error);
        setAvailableSkills([]);
      });
  }, [projectKey, projectName, visible]);

  useEffect(() => {
    if (!visible || !profileHydrated) return;
    const now = new Date().toISOString();
    void ipcBridge.desktopProjects.upsert
      .invoke({
        entry: { id: crypto.randomUUID(), name: projectName, workspace: projectKey, createdAt: now, updatedAt: now },
        profile,
      })
      .catch((error: unknown) => console.error('Failed to save project profile:', error));
  }, [profile, profileHydrated, projectKey, projectName, visible]);

  const duplicateDocumentNames = useMemo(() => {
    const names = profile.documents.map((document) => document.name.toLowerCase());
    return names.some((name, index) => names.indexOf(name) !== index);
  }, [profile.documents]);

  const addSkill = (selectedSkill?: string) => {
    const skill = (selectedSkill ?? skillInput).trim();
    if (!skill) {
      Message.warning('Choose or enter a skill first.');
      return;
    }
    if (profile.skills.includes(skill)) {
      Message.info(`${skill} is already attached to this project.`);
      return;
    }
    setProfile((current) => ({ ...current, skills: [...current.skills, skill] }));
    setSkillInput('');
    Message.success(`Added skill: ${skill}`);
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
    Message.success(`Added Markdown file: ${name}`);
  };

  const connectCowork = async () => {
    const result = await ipcBridge.dialog.showOpen.invoke({
      properties: ['openDirectory', 'createDirectory'],
    });
    const workspace = result[0];
    if (workspace) {
      setProfile((current) => ({ ...current, coworkWorkspace: workspace }));
    }
  };

  const save = async () => {
    if (duplicateDocumentNames) {
      Message.error('Markdown file names must be unique.');
      return;
    }
    const now = new Date().toISOString();
    await ipcBridge.desktopProjects.upsert.invoke({
      entry: { id: crypto.randomUUID(), name: projectName, workspace: projectKey, createdAt: now, updatedAt: now },
      profile,
    });
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
      <div className='max-h-[68vh] overflow-y-auto pe-8px'>
      <Space direction='vertical' size='large' className='w-full'>
        <div>
          <Typography.Title heading={6}>Project model</Typography.Title>
          <Select
            allowClear
            value={profile.model ? `${profile.model.providerId}::${profile.model.modelId}` : undefined}
            placeholder='Use the global default model'
            className='w-full'
            onChange={(value?: string) => {
              if (!value) {
                setProfile((current) => ({ ...current, model: undefined }));
                return;
              }
              const [providerId, ...modelParts] = value.split('::');
              setProfile((current) => ({ ...current, model: { providerId, modelId: modelParts.join('::') } }));
            }}
          >
            {providers.flatMap((provider) =>
              (provider.models ?? []).map((modelId) => (
                <Select.Option key={`${provider.id}::${modelId}`} value={`${provider.id}::${modelId}`}>
                  {provider.name || provider.id} — {modelId}
                </Select.Option>
              ))
            )}
          </Select>
        </div>

        <div>
          <Typography.Title heading={6}>Cowork Desktop</Typography.Title>
          <Space className='w-full'>
            <Input value={profile.coworkWorkspace ?? ''} readOnly placeholder='No Cowork folder connected' />
            <Button icon={<FolderOpen />} onClick={() => void connectCowork()}>Connect folder</Button>
          </Space>
        </div>

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
            <Select
              allowCreate
              showSearch
              value={skillInput || undefined}
              onChange={(value) => setSkillInput(value ?? '')}
              onSearch={setSkillInput}
              placeholder='Choose an installed skill or enter its name'
              className='flex-1 min-w-360px'
            >
              {availableSkills.map((skill) => (
                <Select.Option key={skill.name} value={skill.name}>
                  {skill.name}{skill.description ? ` — ${skill.description}` : ''}
                </Select.Option>
              ))}
            </Select>
            <Button icon={<Plus />} onClick={() => addSkill()}>Add</Button>
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
          <Typography.Title heading={6}>{t('conversation.projectMemory.title')}</Typography.Title>
          <Typography.Paragraph type='secondary'>{t('conversation.projectMemory.description')}</Typography.Paragraph>
          <Input.TextArea
            value={profile.memory}
            onChange={(memory) => setProfile((current) => ({ ...current, memory }))}
            placeholder={t('conversation.projectMemory.placeholder')}
            autoSize={{ minRows: 4, maxRows: 10 }}
            maxLength={12000}
            showWordLimit
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
      </div>
    </Modal>
  );
};

export default ProjectProfileModal;
