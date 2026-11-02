import type { WModule } from './workshops'

// Course DV-09 (Engineering Training Manual) chapter 8, DeltaV Security, pages 8-1 .. 8-64.

export const DV09_CHAPTER8: WModule = {
  module: 'DV-09 · Ch 8 DeltaV Security',
  workshops: [
    {
      id: 'dv09-ch8-reading',
      title: 'DeltaV Security (reading), pp 8-3 to 8-31 and 8-35 to 8-55',
      objective: 'Define parameter, field and function security, users, groups, locks, the FlexLock application, electronic signatures, workstation options, DeltaV Simulate, Mimic, AMS and DeltaV Export (objectives, p8-3).',
      note: 'Reference material: there are no configuration steps on these pages. Tick each item when you have read it and found the matching place in the trainer. The User Manager is opened from DeltaV Explorer with the Lock Key button; Security Properties are under Setup > Security in the Explorer tree. FlexLock is the logon overlay (Lock Workstation in the top bar); the Windows desktop itself is not simulated.',
      steps: [
        { id: 'dv09-8r-1', text: 'Locks & Keys (pp 8-4 to 8-7): the DeltaV System secures parameters, fields, functions and electronic signatures with locks and keys. Control (MODE, SP, OUT), Restricted Control (BKCAL_IN, FF_ENABLE, RESTART_ENABLE), Tuning (GAIN, RESET, HI_LIM), System Records (ENAB), Diagnostic, Alarms (HORN, MACK, NALM), User Lock 01 to 10, Batch Operate, Build Recipes, Can Calibrate, Can Configure, Can Download and System Admin. The User Manager Locks window lists them.', goto: 'users' },
        { id: 'dv09-8r-2', text: 'Parameter Security (pp 8-8, 8-9): from DeltaV Explorer, System Configuration > Setup > Security > Parameter Security > Properties. "Writable" parameters have locks assigned to them; the dialog lets you change the lock assignments.', goto: 'explorer' },
        { id: 'dv09-8r-3', text: 'Field Security (pp 8-10, 8-11): System Configuration > Setup > Security > Field Security > Properties. Writable fields have locks that you can change.', goto: 'explorer' },
        { id: 'dv09-8r-4', text: 'Function Security (pp 8-12, 8-13): System Configuration > Setup > Security > Function Security > Properties. Various writable functions have locks that you can change.', goto: 'explorer' },
        { id: 'dv09-8r-5', text: 'User Manager and Users (pp 8-14 to 8-23): the Lock Key button in DeltaV Explorer opens the DeltaV User Manager (Users, Groups and Locks windows). Right-click a blank area of the Users window > New opens the New User dialog: General (name, full name, password, account type), Advanced (account and password status), Groups (the groups the user belongs to, each for a Plant Area or Sitewide) and Keys (keys granted for a Plant Area or Sitewide; Can Configure, Can Download, Can Calibrate, Diagnostic and System Admin must be Sitewide to take effect).', goto: 'users' },
        { id: 'dv09-8r-6', text: 'Groups (pp 8-24 to 8-29): double-click a group in the Groups window for Properties for Group: General (name, description), Members (add and remove users) and Keys (grant and remove keys).', goto: 'users' },
        { id: 'dv09-8r-7', text: 'FlexLock (pp 8-30, 8-31): limits desktop access to the users with the required privileges: a user with Windows Desktop Access gets the Windows and DeltaV desktops, other users only the DeltaV desktop (Operate and its applications). Operators normally get the DeltaV desktop only. You cannot exit FlexLock from the DeltaV desktop. (Not simulated: only the logon overlay is.)', goto: 'users' },
        { id: 'dv09-8r-8', text: 'Electronic Signatures (pp 8-35 to 8-43): user names and passwords that give accountability for operator writes from DeltaV Operate and Control Studio online (not OPC writes or the Excel Add-In). No signature, one signature (confirmer) or two (confirmer and verifier, who must hold the ACTION_VERIFY key). Enable signature policies in System Preferences (then shut down and reconnect the server), enable Electronic Signatures in Operate and Control Studio, create a policy (New Signature Policy; Parameter Confirmation tab), enable the Plant Area and the module. Signature events are logged in the Event Chronicle.', goto: 'system' },
        { id: 'dv09-8r-9', text: 'Station software (pp 8-44 to 8-49): functionality included, options you can add and options not allowed on the ProfessionalPLUS, Professional, Maintenance, Operator, Base and Application stations. (Not simulated: the trainer is one station.)' },
        { id: 'dv09-8r-10', text: 'DeltaV Simulate, MiMiC and AMS (pp 8-51 to 8-55): DeltaV Simulate runs all DeltaV software without duplicate hardware (single PC or multi-node, faster or slower than real time); MiMiC adds process models and auto-generated tie-backs; the AMS Intelligent Device Manager configures, calibrates and monitors intelligent field devices. The local simulator (time scale, Initialize Simulation) is on the System Preferences display; MiMiC and AMS are not simulated.', goto: 'system' }
      ]
    },
    {
      id: 'dv09-ch8-users',
      title: 'Workshop – Defining Users (pp 8-32 to 8-34)',
      objective: 'Create a user with OPERATE privilege for PLANT_AREA_A only, create a user with TUNE privilege and download capability, download the workstation and verify.',
      note: 'DeltaV Explorer > Lock Key button > DeltaV User Manager. Right-click a blank area of the Users window > New: General tab - Name, Full Name, Password and Confirm Password; Groups tab - select the Operate group (or Tune), Add --> and choose the Plant Area in the dialog (PLANT_AREA_A, or <Sitewide>); Keys tab - Can Download needs <Sitewide>. Step 3: DeltaV Explorer > Physical Network > Control Network > right-click PROPLUS > Download > Workstation. Steps 4 and 5: the Windows log off is not simulated; use Lock Workstation (FlexLock) in the top bar and log on as each new user, then try what each user may do (OperatorA writes only in PLANT_AREA_A and cannot tune; Supervisor1 tunes and downloads anywhere). The security checks read the users and groups, the logon events of the Event Journal, and the downloaded workstation copy.',
      steps: [
        { id: 'dv09-8u-1', text: 'Step 1. Create a User with OPERATE privilege and the following characteristics: Name OperatorA, Full Name Alpha Operator, Password operatora, Privileges OPERATE privileges only for PLANT_AREA_A.', goto: 'users' },
        { id: 'dv09-8u-2', text: 'Step 2. Create a User with TUNE privilege and the following characteristics: Name Supervisor1, Full Name Sarge Supervisor, Password supervisor1, Privileges Sitewide TUNE privileges and download capability.', goto: 'users' },
        { id: 'dv09-8u-3', text: 'Step 3. Download the Workstation.', goto: 'explorer' },
        { id: 'dv09-8u-4', text: 'Step 4. Verify by logging all the way out to the XP Log In: close all applications, then log off the current user and log on as one of your new users (simulated: Lock Workstation, then log on with FlexLock).' },
        { id: 'dv09-8u-5', text: 'Step 5. Verify each new user\'s functionality (log on as OperatorA and as Supervisor1; the downloaded workstation must give OperatorA control in PLANT_AREA_A only and Supervisor1 sitewide tuning and download).' }
      ]
    },
    {
      id: 'dv09-ch8-export',
      title: 'Workshop – Export (pp 8-56 to 8-62)',
      objective: 'Export the configuration database and copy the operator displays to removable media.',
      note: 'DeltaV Explorer: right-click Physical Network > Export (a Save dialog appears: choose the removable drive and click Save), right-click Control Strategies > Export, and right-click each named set (System Configuration > Setup > Named Sets) > Export. The export files are BatchLive packages, not native DeltaV .fhx files. Steps 6 and 8: the Windows XP Explorer is not simulated; the operator pictures are exported from Setup > Export / Import > Operator pictures (the .grf copy). Steps 6 and 9 stay tick-only. The workshop expects the named sets NS-T101 and phase_failures and the pictures Ovw_ref, Tank101 and Tank201 of the earlier chapters; create them first if your database does not have them.',
      steps: [
        { id: 'dv09-8x-1', text: 'Step 1. From the DeltaV Explorer, right-click on Physical Network and select Export. Step 2. Select a removable drive as the destination, thereby exporting the Physical Network. Click on Save. (checked together)', goto: 'explorer' },
        { id: 'dv09-8x-3', text: 'Step 3. Export Control Strategies by selecting a removable drive as the destination, thereby exporting the Control Strategies. Click on Save.', goto: 'explorer' },
        { id: 'dv09-8x-4', text: 'Step 4. Export Named Sets NS-T101 by selecting a removable drive as the destination, thereby exporting NS-T101. Click on Save.', goto: 'explorer' },
        { id: 'dv09-8x-5', text: 'Step 5. Export Named Sets phase_failures by selecting a removable drive as the destination, thereby exporting phase_failures. Click on Save.', goto: 'explorer' },
        { id: 'dv09-8x-6', text: 'Step 6. Launch Windows XP Explorer by selecting Start > Programs > Accessories > Windows Explorer (not simulated; tick when done).' },
        { id: 'dv09-8x-8', text: 'Step 8. Copy the Ovw_ref.grf, Tank101.grf, and Tank201.grf files to a removable drive from the XP Explorer: DeltaV\\DVData\\Graphics-iFIX\\Pic (simulated: Setup > Export / Import > Operator pictures > Export Pictures).', goto: 'explorer' },
        { id: 'dv09-8x-9', text: 'Step 9. Remove the media and take it home with you.' }
      ]
    },
    {
      id: 'dv09-ch8-esig',
      title: 'Optional Workshop – Electronic Signatures (p 8-63)',
      objective: 'Build an Electronic Signature policy for the MESSAGE parameter in SFC-T101 that requires the administrator to confirm and verify a startup or shutdown request by the operator.',
      note: 'Hints: 1. Enable Signature Policies using System Preferences (select the check box, acknowledge, then shut down the server and connect to it again with the Database Administrator functions of System Preferences). 2. Enable Electronic Signatures using the DeltaV Explorer (Setup > Electronic Signatures: DeltaV Operate and DeltaV Control Studio). 3. Create a new policy (New Signature Policy; Parameter Confirmation: MESSAGE with two signatures). 4. Enable Electronic Signatures on the Plant Area and on the module (the SFC-T101 sequence). SFC-T101 is built in Chapter 7; the check accepts another SFC if SFC-T101 does not exist.',
      steps: [
        { id: 'dv09-8o-1', text: 'Hint 1. Enable Signature Policies using System Preferences (Electronic Signature policies selected, server shut down and reconnected).', goto: 'system' },
        { id: 'dv09-8o-2', text: 'Hint 2. Enable Electronic Signatures using the DeltaV Explorer (DeltaV Operate and DeltaV Control Studio).', goto: 'explorer' },
        { id: 'dv09-8o-3', text: 'Hint 3. Create a new policy for MESSAGE that requires two signatures (confirmer and verifier).', goto: 'explorer' },
        { id: 'dv09-8o-4', text: 'Hint 4. Enable Electronic Signatures on the Plant Area and on the module (SFC-T101) and associate the policy.', goto: 'explorer' }
      ]
    }
  ]
}
